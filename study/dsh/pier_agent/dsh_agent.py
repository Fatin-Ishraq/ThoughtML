"""Pier agent adapter for DeepSeek Harness (DSH) with matched persistent state.

Registers DSH as a custom Pier agent so the three study conditions can be run
against DeepSWE tasks inside Pier's sandboxed environments:

    D  DSH baseline, no study-added state artifact and no state instruction
    M  DSH plus a persistent Markdown ledger
    T  DSH plus a persistent ThoughtML graph and the released checker

Usage (one condition per invocation):

    pier run -p deep-swe/tasks/<task-id> \
        --agent-import-path 'dsh_agent:DshAgent' \
        --agent-kwarg condition=T \
        --model deepseek-official/deepseek-v4-flash

Design notes
------------
Build time is the only moment the agent container has general network access, so
everything that needs the network — Node, DSH, and the plugin's own dependencies
— is installed from :meth:`install_spec`. Runtime only uploads source files into
directories that already exist and already have their ``node_modules`` populated.

State lives at ``/opt/tml-state``, deliberately outside ``/app``. The DeepSWE
verifier collects the graded patch with ``git diff <base> HEAD`` executed in
``/app``, and the task instruction tells the agent to commit everything, so a
ledger written inside the repository would be committed into the graded patch and
would make conditions M and T structurally different from D. This adapter asserts
that isolation before and after the run rather than merely configuring it; see
``protocol.md`` §8.
"""

from __future__ import annotations

import json
import shlex
from pathlib import Path
from typing import Any, ClassVar

from pier.agents.installed.base import BaseInstalledAgent
from pier.environments.base import BaseEnvironment
from pier.models.agent.context import AgentContext
from pier.models.agent.install import AgentInstallSpec, InstallStep
from pier.models.agent.network import NetworkAllowlist

CONDITIONS = ("D", "M", "T")

# Format passed to the plugin's `format` config key, per condition.
CONDITION_FORMAT = {"D": "none", "M": "markdown", "T": "thoughtml"}

# Container layout.
DSH_HOME = "/opt/dsh-home"
AGENT_ROOT = "/opt/tml-agent"
PLUGIN_DIR = AGENT_ROOT + "/plugin"
STUDY_PLUGIN_DIR = AGENT_ROOT + "/study"
BIN_DIR = AGENT_ROOT + "/bin"
PATCH_PATH = AGENT_ROOT + "/study.patch.yml"
STATE_ROOT = "/opt/tml-state"
WORKSPACE = "/app"

# /logs/agent is bind-mounted onto the host at self.logs_dir, so anything written
# here is readable from populate_context_post_run(), which has no environment.
LOG_ROOT = "/logs/agent"

DEFAULT_DSH_VERSION = "0.1.1-rc.2"
# Node 24, not 22, specifically because of the egress proxy. Pier restricts the
# agent container to an authenticated Squid proxy and exports HTTP_PROXY /
# HTTPS_PROXY, but Node's global fetch ignores those variables by default: a
# Node 22 run reaches api.deepseek.com directly, which the sandbox then blocks,
# surfacing as "TRANSPORT: DeepSeek API request failed". Node 24 honours them
# when NODE_USE_ENV_PROXY=1 is set (verified empirically, see run()).
DEFAULT_NODE_MAJOR = "24"
DEFAULT_MODEL = "deepseek-v4-flash"
DEFAULT_PROVIDER = "deepseek-official"

# The model protocol.md pins. Anything else is a development run: cheaper
# iteration on the harness and the state guidance, never a study outcome.
STUDY_PROVIDER = "deepseek-official"
STUDY_MODEL = "deepseek-v4-flash"

# How each provider route is credentialed, reached, and served.
#
# ``pi_ai_route`` names the route on DSH's generic multi-provider adapter
# (@deepseek-ai/dsh-llm-pi-ai). ``None`` means the provider has its own built-in
# plugin — deepseek-official is served by llm-deepseek — and needs no route
# declaration. A provider whose model is newer than pi-ai's shipped catalog must
# declare that model explicitly; see _render_patch.
PROVIDER_PROFILES: dict[str, dict[str, Any]] = {
    "deepseek-official": {
        "credential_env": "DEEPSEEK_API_KEY",
        "allowlist": ("api.deepseek.com",),
        "pi_ai_route": None,
    },
    "openrouter": {
        "credential_env": "OPENROUTER_API_KEY",
        "allowlist": ("openrouter.ai",),
        "pi_ai_route": "openrouter",
        # Free routes share an upstream pool and return 429 with a Retry-After
        # of a few seconds. pi-ai's default is five retries on a short backoff,
        # which a busy pool outruns, so the route waits longer and longer. This
        # only affects development runs: the pinned study provider has no
        # retry_policy entry and keeps pi-ai's default.
        "retry_policy": {
            "mode": "normal",
            "maxRetries": 8,
            "backoff": {
                "initialDelayMs": 2000,
                "maxDelayMs": 30000,
                "jitterRatio": 0.2,
            },
        },
    },
}


class StateIsolationError(RuntimeError):
    """Raised when study state could leak into the graded patch."""


class DshAgent(BaseInstalledAgent):
    """DeepSeek Harness driven headlessly, with optional persistent state."""

    # DSH does not emit Pier's ATIF trajectory format. Metrics come from the
    # study's own collector instead; see protocol.md §10 gate 4.
    SUPPORTS_ATIF: bool = False
    SUPPORTS_WINDOWS: bool = False

    CLI_FLAGS: ClassVar[list] = []
    ENV_VARS: ClassVar[list] = []

    def __init__(
        self,
        logs_dir: Path,
        condition: str = "D",
        dsh_version: str = DEFAULT_DSH_VERSION,
        node_major: str = DEFAULT_NODE_MAJOR,
        plugin_src: str | None = None,
        study_plugin_src: str | None = None,
        thoughtml_binary: str | None = None,
        strict: bool = True,
        max_state_bytes: int = 65536,
        max_context_chars: int = 12000,
        history_limit: int = 50,
        context_window: int | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ):
        condition = str(condition).upper()
        if condition not in CONDITIONS:
            raise ValueError(
                "condition must be one of %s, got %r" % (list(CONDITIONS), condition)
            )
        self.condition = condition
        self._dsh_version = dsh_version
        self._node_major = str(node_major)
        self._strict = bool(strict)
        self._max_state_bytes = int(max_state_bytes)
        self._max_context_chars = int(max_context_chars)
        self._history_limit = int(history_limit)

        repo_root = Path(__file__).resolve().parents[3]
        self._plugin_src = Path(plugin_src or repo_root / "integrations" / "dsh")
        self._study_plugin_src = Path(
            study_plugin_src or repo_root / "study" / "dsh" / "plugins"
        )
        self._thoughtml_binary = Path(thoughtml_binary) if thoughtml_binary else None

        if self.condition == "T" and self._thoughtml_binary is None:
            raise ValueError(
                "condition T requires thoughtml_binary=<path to a Linux thoughtml "
                "build>; the checker is part of the T treatment bundle"
            )
        if self._thoughtml_binary and not self._thoughtml_binary.is_file():
            raise ValueError(
                "thoughtml_binary not found: %s" % self._thoughtml_binary
            )
        if self.condition != "D" and not (self._plugin_src / "src" / "index.js").is_file():
            raise ValueError(
                "plugin source not found under %s" % self._plugin_src
            )

        self._context_window = context_window
        self._max_tokens = max_tokens

        super().__init__(logs_dir, **kwargs)

        provider = self._parsed_model_provider or DEFAULT_PROVIDER
        if provider not in PROVIDER_PROFILES:
            raise ValueError(
                "unknown provider %r. Known: %s. Pass the model as "
                "'<provider>/<model>'; for OpenRouter the model id may itself "
                "contain a slash, e.g. 'openrouter/vendor/model'."
                % (provider, sorted(PROVIDER_PROFILES))
            )
        self.provider = provider
        self.profile = PROVIDER_PROFILES[provider]

        # Study runs are pinned by protocol.md §5. Everything else is a
        # development run and is labelled as such in the agent identity and the
        # metrics metadata, so a cheap iteration can never be quietly reported
        # as a study outcome.
        self.is_study_model = (
            provider == STUDY_PROVIDER and self._parsed_model_name == STUDY_MODEL
        )

    # ---------------------------------------------------------------- identity

    @staticmethod
    def name() -> str:
        return "dsh"

    def get_version_command(self) -> str | None:
        return "dsh --version"

    def parse_version(self, stdout: str) -> str:
        return stdout.strip().splitlines()[-1].strip() if stdout.strip() else "unknown"

    def to_agent_info(self):
        info = super().to_agent_info()
        # A development run is labelled in the recorded agent name, so it is
        # visible in Pier's own result tables and cannot be mistaken later for
        # one of the nine pinned sessions.
        info.name = "dsh-%s" % self.condition
        if not self.is_study_model:
            info.name += "-dev"
        return info

    # ----------------------------------------------------------------- network

    def network_allowlist(self) -> NetworkAllowlist:
        """Only the model API for the configured provider.

        The task itself runs no-network. Keeping this to the single provider
        host is what stops the agent reaching the open internet — notably
        DeepSWE's published reference solutions on raw.githubusercontent.com.
        """
        domains = set(self.profile["allowlist"])
        for key in ("DEEPSEEK_BASE_URL", "DSH_DEEPSEEK_BASE_URL", "OPENROUTER_BASE_URL"):
            value = self._get_env(key)
            if value:
                from pier.agents.network import hostname_from_url

                if host := hostname_from_url(value):
                    domains.add(host)
        return NetworkAllowlist(domains=sorted(domains))

    # ----------------------------------------------------------------- install

    def install_spec(self) -> AgentInstallSpec:
        """Build-time install. This is the only step with general network access."""
        node_setup = (
            "set -eu; "
            "if command -v apt-get >/dev/null 2>&1; then "
            "  apt-get update; "
            "  apt-get install -y curl ca-certificates git; "
            "  curl -fsSL https://deb.nodesource.com/setup_%s.x | bash -; "
            "  apt-get install -y nodejs; "
            "elif command -v apk >/dev/null 2>&1; then "
            "  apk add --no-cache curl bash git nodejs npm; "
            "elif command -v dnf >/dev/null 2>&1; then "
            "  dnf install -y curl git nodejs npm; "
            "elif command -v yum >/dev/null 2>&1; then "
            "  yum install -y curl git nodejs npm; "
            "else "
            "  echo 'no known package manager' >&2; exit 1; "
            "fi; "
            "node --version; npm --version"
        ) % self._node_major

        # The plugin's package.json is materialised at build time so npm can fetch
        # its DSH dependencies while the network is still available. Only the
        # source files are uploaded later, into this prepared directory.
        plugin_pkg = json.dumps(
            {
                "name": "thoughtml-dsh-plugin-host",
                "private": True,
                "type": "module",
                "dependencies": {
                    "@deepseek-ai/dsh-llm": self._dsh_version,
                    "@deepseek-ai/dsh-tools": self._dsh_version,
                },
            },
            indent=2,
        )

        install_root = (
            "set -eu; "
            "npm install -g @deepseek-ai/dsh@{version}; "
            "mkdir -p {plugin}/src {study} {bin} {state} {dsh_home} {logs}; "
            "printf '%s' {pkg} > {plugin}/package.json; "
            "npm install --prefix {plugin} --omit=dev --no-audit --no-fund; "
            # Warm DSH_HOME so the headless profile is materialised while the
            # network is still up; at run time the container is restricted.
            "DSH_HOME={dsh_home} DSH_TELEMETRY_MODE=DISABLED "
            "  dsh --profile headless --dump-config > /dev/null; "
            "chmod -R 0777 {state} {dsh_home} {agent_root} {logs} || true; "
            "dsh --version"
        ).format(
            version=self._dsh_version,
            plugin=PLUGIN_DIR,
            study=STUDY_PLUGIN_DIR,
            bin=BIN_DIR,
            state=STATE_ROOT,
            dsh_home=DSH_HOME,
            agent_root=AGENT_ROOT,
            logs=LOG_ROOT,
            pkg=shlex.quote(plugin_pkg),
        )

        return AgentInstallSpec(
            agent_name=self.name(),
            version=self._dsh_version,
            steps=[
                InstallStep(
                    user="root",
                    env={"DEBIAN_FRONTEND": "noninteractive"},
                    run=node_setup,
                ),
                InstallStep(
                    user="root",
                    env={"DEBIAN_FRONTEND": "noninteractive"},
                    run=install_root,
                ),
            ],
            verification_command="dsh --version",
            metadata={"condition": self.condition},
        )

    # ------------------------------------------------------------------- setup

    async def setup(self, environment: BaseEnvironment) -> None:
        await super().setup(environment)

        await self.exec_as_root(
            environment,
            "mkdir -p %s %s %s %s %s %s && chmod -R 0777 %s %s %s %s"
            % (
                PLUGIN_DIR + "/src",
                STUDY_PLUGIN_DIR,
                BIN_DIR,
                STATE_ROOT,
                DSH_HOME,
                LOG_ROOT,
                STATE_ROOT,
                DSH_HOME,
                AGENT_ROOT,
                LOG_ROOT,
            ),
        )

        # Upload plugin sources into the prepared, dependency-populated directory.
        await environment.upload_dir(self._plugin_src / "src", PLUGIN_DIR + "/src")
        await environment.upload_dir(self._study_plugin_src, STUDY_PLUGIN_DIR)

        if self._thoughtml_binary is not None:
            target = BIN_DIR + "/thoughtml"
            await environment.upload_file(self._thoughtml_binary, target)
            await self.exec_as_root(environment, "chmod 0755 %s" % target)
            result = await environment.exec(command="%s --version" % target)
            if result.return_code != 0:
                raise RuntimeError(
                    "uploaded thoughtml binary is not executable in this container "
                    "(exit %s): %s" % (result.return_code, result.stderr)
                )
            self.logger.info("thoughtml checker: %s", (result.stdout or "").strip())

        patch = self._render_patch()
        await self.exec_as_root(
            environment,
            "printf '%%s' %s > %s && chmod 0644 %s"
            % (shlex.quote(patch), PATCH_PATH, PATCH_PATH),
        )
        (self.logs_dir / "study.patch.yml").write_text(patch, encoding="utf-8")

        await self._assert_state_isolation(environment, phase="pre")

    def _render_patch(self) -> str:
        """Render the DSH profile patch overlay for this condition."""
        model = self._parsed_model_name or DEFAULT_MODEL
        lines: list[str] = [
            "# Generated by dsh_agent.py — do not edit by hand.",
            "- id: agent-default-model",
            "  config:",
            "    provider: '%s'" % self.provider,
            "    model: '%s'" % model,
            "- id: session-telemetry-otel",
            "  disabled: true",
        ]

        # Providers without a built-in DSH plugin are served by the generic
        # multi-provider adapter. A model newer than pi-ai's shipped catalog is
        # not resolvable by name alone — it fails with UNKNOWN_MODEL — so the
        # route declares it explicitly. Declaring `models` replaces the catalog
        # for that route, which also pins exactly what a run may address.
        route = self.profile["pi_ai_route"]
        if route:
            lines += [
                "- id: llm-pi-ai",
                "  config:",
                "    providers:",
                "      %s:" % route,
                "        apiKeyEnv: %s" % self.profile["credential_env"],
                "        models:",
                "          - id: '%s'" % model,
            ]
            if self._context_window:
                lines.append("            contextWindow: %d" % self._context_window)
            if self._max_tokens:
                lines.append("            maxTokens: %d" % self._max_tokens)

            retry = self.profile.get("retry_policy")
            if retry:
                lines += [
                    "        retryPolicy:",
                    "          mode: %s" % retry["mode"],
                    "          maxRetries: %d" % retry["maxRetries"],
                    "          backoff:",
                    "            initialDelayMs: %d" % retry["backoff"]["initialDelayMs"],
                    "            maxDelayMs: %d" % retry["backoff"]["maxDelayMs"],
                    "            jitterRatio: %s" % retry["backoff"]["jitterRatio"],
                ]

        # Identical in D, M and T. Two distinct validity threats:
        #
        # Web search resolves through the allowlisted model-API host, so it works
        # even in a no-network container. On 2026-08-25 a probe and a dry run
        # both used it to retrieve
        # raw.githubusercontent.com/datacurve-ai/deep-swe/.../solution/solution.patch
        # — DeepSWE publishes the reference solution in its public repo. Left
        # enabled, every session measures how well the model finds the answer
        # online rather than whether it can solve the task.
        #
        # todo_write and the goal tool are DSH's own persistent scratchpads. They
        # are competing state mechanisms: with them available the baseline is not
        # "no persistent state", and the model reaches for the familiar built-in
        # instead of the study's ledger. Removing them is what makes D a real
        # baseline and makes T-minus-M a comparison of state *representations*
        # rather than a race between two note-taking habits.
        for plugin_id in (
            "web",
            "web-search-deepseek",
            "tool-web",
            "tool-todo",
            "tool-goal",
        ):
            lines += ["- id: %s" % plugin_id, "  disabled: true"]

        lines += [
            "- insert:",
            "    - id: study-event-logger",
            "      name: 'file://%s/event-logger.js'" % STUDY_PLUGIN_DIR,
            "      config:",
            "        condition: '%s'" % self.condition,
            "        outputDir: '%s/logs'" % LOG_ROOT,
            "    - id: study-metrics",
            "      name: 'file://%s/src/metrics.js'" % PLUGIN_DIR,
            "      config:",
            "        condition: '%s'" % self.condition,
            "        format: '%s'" % CONDITION_FORMAT[self.condition],
            "        outputDir: '%s/metrics'" % LOG_ROOT,
        ]

        if self.condition in ("M", "T"):
            lines += [
                "    - id: study-reasoning-state",
                "      name: 'file://%s/src/index.js'" % PLUGIN_DIR,
                "      config:",
                "        format: '%s'" % CONDITION_FORMAT[self.condition],
                "        stateRoot: '%s'" % STATE_ROOT,
                "        strict: %s" % ("true" if self._strict else "false"),
                "        maxStateBytes: %d" % self._max_state_bytes,
                "        maxContextChars: %d" % self._max_context_chars,
                "        historyLimit: %d" % self._history_limit,
                "        recoveryGuidance: true",
            ]
            if self.condition == "T":
                lines.append("        thoughtmlBinary: '%s/thoughtml'" % BIN_DIR)

        return "\n".join(lines) + "\n"

    # --------------------------------------------------------------- isolation

    async def _assert_state_isolation(
        self, environment: BaseEnvironment, phase: str
    ) -> None:
        """Fail the session if study state could reach the graded patch.

        ``phase='pre'``  the state root must resolve outside the repository.
        ``phase='post'`` nothing under the state root or the agent root may be
        tracked, staged, or untracked inside the repository working tree.
        """
        resolved = await environment.exec(
            command="readlink -f %s || echo MISSING" % STATE_ROOT
        )
        state_real = (resolved.stdout or "").strip()
        if not state_real or state_real == "MISSING":
            raise StateIsolationError("state root %s does not exist" % STATE_ROOT)
        if state_real == WORKSPACE or state_real.startswith(WORKSPACE + "/"):
            raise StateIsolationError(
                "state root resolves inside the graded repository: %s" % state_real
            )

        status = await environment.exec(
            command="cd %s && git status --porcelain 2>&1 || true" % WORKSPACE
        )
        status_text = status.stdout or ""
        (self.logs_dir / ("git-status-%s.txt" % phase)).write_text(
            status_text, encoding="utf-8"
        )

        leaked = [
            line
            for line in status_text.splitlines()
            if STATE_ROOT.lstrip("/") in line
            or AGENT_ROOT.lstrip("/") in line
            or "tml-state" in line
        ]
        if leaked:
            raise StateIsolationError(
                "study state appears in the repository working tree (%s phase):\n%s"
                % (phase, "\n".join(leaked[:20]))
            )

        record = {
            "phase": phase,
            "condition": self.condition,
            "state_root": STATE_ROOT,
            "state_root_resolved": state_real,
            "workspace": WORKSPACE,
            "git_status_lines": len([x for x in status_text.splitlines() if x.strip()]),
            "leaked": leaked,
        }
        (self.logs_dir / ("state-isolation-%s.json" % phase)).write_text(
            json.dumps(record, indent=1), encoding="utf-8"
        )

    # --------------------------------------------------------------------- run

    def build_run_env(self) -> dict[str, str]:
        """Environment for the DSH process. Separated so it can be tested."""
        credential_env = self.profile["credential_env"]
        api_key = self._get_env(credential_env)
        if not api_key:
            raise ValueError(
                "%s is not set, and provider %r needs it. Provide it via "
                "--env-file or agent.env; it is never written to a tracked file."
                % (credential_env, self.provider)
            )

        env = self.build_process_env(
            {
                "DSH_HOME": DSH_HOME,
                "DSH_TELEMETRY_MODE": "DISABLED",
                credential_env: api_key,
                "THOUGHTML_STUDY_CONDITION": self.condition,
                # Required for the model call to survive Pier's filtered egress.
                # Without it Node's fetch ignores HTTP_PROXY/HTTPS_PROXY and
                # tries to reach the API directly, which the sandbox blocks.
                "NODE_USE_ENV_PROXY": "1",
            }
        )
        for key in ("DEEPSEEK_BASE_URL", "DSH_PERMISSION_MODE"):
            if value := self._get_env(key):
                env[key] = value
        return env

    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        env = self.build_run_env()
        rendered = self.render_instruction(instruction)
        command = "dsh --profile headless --patch %s %s > %s/dsh-stdout.txt 2> %s/dsh-stderr.txt" % (
            shlex.quote(PATCH_PATH),
            shlex.quote(rendered),
            LOG_ROOT,
            LOG_ROOT,
        )

        try:
            await self.exec_as_agent(environment, command, env=env, cwd=WORKSPACE)
        finally:
            # Both run even when DSH exits non-zero or times out: a contaminated
            # patch must be detected regardless of how the session ended, and a
            # failed session's artifacts are exactly the ones worth keeping.
            await self._assert_state_isolation(environment, phase="post")
            await self._preserve_artifacts(environment)

    async def _preserve_artifacts(self, environment: BaseEnvironment) -> None:
        """Copy state and DSH session events into the bind-mounted log root.

        The state root and DSH_HOME live outside /app on purpose, which also puts
        them outside anything Pier mounts back to the host. Without this copy the
        ledger, its immutable revision journal, and the raw session events would
        be destroyed with the container, and protocol.md §12 requires all three
        for every session.
        """
        for source, name in ((STATE_ROOT, "state"), (DSH_HOME + "/sessions", "dsh-sessions")):
            result = await environment.exec(
                command="if [ -d %s ]; then mkdir -p %s/%s && cp -a %s/. %s/%s/ && echo COPIED; else echo ABSENT; fi"
                % (source, LOG_ROOT, name, source, LOG_ROOT, name),
                user="root",
            )
            status = (result.stdout or "").strip()
            if result.return_code != 0 or status not in ("COPIED", "ABSENT"):
                self.logger.warning(
                    "could not preserve %s (exit %s): %s",
                    source,
                    result.return_code,
                    (result.stderr or "").strip()[:300],
                )
            else:
                self.logger.info("preserved %s: %s", source, status)

        # Make the copies readable from the host side after the container exits.
        await environment.exec(
            command="chmod -R a+rX %s || true" % LOG_ROOT, user="root"
        )

    # ---------------------------------------------------------------- accounting

    def populate_context_post_run(self, context: AgentContext) -> None:
        """Fill usage from the study metrics collector's summary.

        DSH is not an ATIF agent, so Pier cannot derive these itself. The summary
        is written inside the container to /logs/agent/metrics, which is bind
        mounted onto self.logs_dir.
        """
        summary_path = self.logs_dir / "metrics" / "metrics-summary.json"
        if not summary_path.is_file():
            self.logger.warning("no metrics summary at %s", summary_path)
            return
        try:
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            self.logger.warning("could not read metrics summary: %s", exc)
            return

        sessions = summary.get("sessions") or []
        if not sessions:
            self.logger.warning("metrics summary contains no sessions")
            return

        def total(field: str) -> int:
            return sum(_as_int(s.get(field)) or 0 for s in sessions)

        context.n_input_tokens = total("inputTokens")
        context.n_cache_tokens = total("cacheReadTokens")
        context.n_output_tokens = total("outputTokens")
        context.n_agent_steps = total("steps")
        # The collector records no per-call context high-water mark, so
        # peak_context_tokens is deliberately left unset rather than guessed.

        context.metadata = {
            "condition": self.condition,
            "state_format": CONDITION_FORMAT[self.condition],
            "dsh_version": self._dsh_version,
            "provider": self.provider,
            "model": self._parsed_model_name,
            "is_study_model": self.is_study_model,
            "run_class": "study" if self.is_study_model else "development",
            "reasoning_tokens": total("reasoningTokens"),
            "model_calls": total("modelCalls"),
            "tool_calls": total("toolCalls"),
            "failed_tool_calls": total("failedToolCalls"),
            "repeated_actions": total("repeatedActions"),
            "repeated_failed_actions": total("repeatedFailedActions"),
            "recovery_episodes_started": total("recoveryEpisodesStarted"),
            "recovery_episodes_completed": total("recoveryEpisodesCompleted"),
            "state_reads": total("stateReads"),
            "state_commits": total("stateCommits"),
            "state_commit_rejections": total("stateCommitRejections"),
            "state_checkpoints_after_failure": total("stateCheckpointsAfterFailure"),
            "telemetry_mode": summary.get("telemetryMode"),
            "credential_present_in_metrics": summary.get("credentialPresent"),
            "metrics_summary": summary,
        }


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
