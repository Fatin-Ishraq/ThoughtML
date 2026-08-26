"""Offline self-test for the DSH Pier adapter.

Instantiates all three conditions, renders their profile patches and install
specs, and checks the invariants that matter for study validity. Runs no
container, makes no model call, and needs no credential.

    <pier-venv>/bin/python selftest.py
"""

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dsh_agent  # noqa: E402
from dsh_agent import (  # noqa: E402
    AGENT_ROOT,
    CONDITION_FORMAT,
    DshAgent,
    STATE_ROOT,
    WORKSPACE,
)

FAILURES: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print("  ok   %s" % label)
    else:
        print("  FAIL %s %s" % (label, detail))
        FAILURES.append(label)


def build(condition: str, tmp: Path, thoughtml: Path | None = None) -> DshAgent:
    logs = tmp / ("logs-" + condition)
    logs.mkdir(parents=True, exist_ok=True)
    kwargs = {}
    if thoughtml is not None:
        kwargs["thoughtml_binary"] = str(thoughtml)
    return DshAgent(
        logs_dir=logs,
        condition=condition,
        model_name="deepseek-official/deepseek-v4-flash",
        **kwargs,
    )


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="dsh-adapter-selftest-"))

    # A stand-in for the Linux thoughtml build; the adapter only checks it exists
    # at construction time and executes it inside the container.
    fake_checker = tmp / "thoughtml"
    fake_checker.write_bytes(b"#!/bin/sh\necho thoughtml 0.5.0\n")
    os.chmod(fake_checker, 0o755)

    print("identity")
    check("agent name is 'dsh'", DshAgent.name() == "dsh")
    check("does not claim ATIF support", DshAgent.SUPPORTS_ATIF is False)

    print("condition validation")
    try:
        build("X", tmp)
        check("rejects unknown condition", False, "no error raised")
    except ValueError:
        check("rejects unknown condition", True)
    try:
        build("T", tmp)
        check("condition T requires the checker", False, "no error raised")
    except ValueError:
        check("condition T requires the checker", True)

    agents = {
        "D": build("D", tmp),
        "M": build("M", tmp),
        "T": build("T", tmp, fake_checker),
    }

    print("network allowlist")
    for code, agent in agents.items():
        domains = agent.network_allowlist().domains
        check(
            "%s allowlists only the model API (%s)" % (code, domains),
            domains == ["api.deepseek.com"],
            str(domains),
        )

    print("state isolation by construction")
    check(
        "state root is outside the graded repository",
        not STATE_ROOT.startswith(WORKSPACE + "/") and STATE_ROOT != WORKSPACE,
        STATE_ROOT,
    )
    check(
        "agent assets are outside the graded repository",
        not AGENT_ROOT.startswith(WORKSPACE + "/") and AGENT_ROOT != WORKSPACE,
        AGENT_ROOT,
    )

    print("profile patches")
    patches = {code: agent._render_patch() for code, agent in agents.items()}
    for code, patch in patches.items():
        (tmp / ("patch-%s.yml" % code)).write_text(patch, encoding="utf-8")
        check(
            "%s pins the study model" % code,
            "deepseek-v4-flash" in patch and "deepseek-official" in patch,
        )
        check("%s disables telemetry export" % code, "session-telemetry-otel" in patch)
        check(
            "%s does not load any offline mock" % code,
            "mock-llm" not in patch and "mock-operation" not in patch,
        )
        check(
            "%s declares its own condition only" % code,
            patch.count("condition: '%s'" % code) >= 1
            and all(
                "condition: '%s'" % other not in patch
                for other in CONDITION_FORMAT
                if other != code
            ),
        )

    check(
        "D loads no reasoning-state plugin",
        "study-reasoning-state" not in patches["D"],
    )
    for code in ("M", "T"):
        check(
            "%s loads the reasoning-state plugin" % code,
            "study-reasoning-state" in patches[code],
        )
        check(
            "%s writes state outside /app" % code,
            ("stateRoot: '%s'" % STATE_ROOT) in patches[code],
        )
    check(
        "M uses the markdown format",
        "format: 'markdown'" in patches["M"],
    )
    check(
        "T uses the thoughtml format",
        "format: 'thoughtml'" in patches["T"],
    )
    check(
        "only T wires the checker binary",
        "thoughtmlBinary" in patches["T"]
        and "thoughtmlBinary" not in patches["M"]
        and "thoughtmlBinary" not in patches["D"],
    )

    print("M/T parity (the primary contrast must differ only in format)")
    m_lines = [
        line
        for line in patches["M"].splitlines()
        if "format:" not in line and "condition:" not in line
    ]
    t_lines = [
        line
        for line in patches["T"].splitlines()
        if "format:" not in line
        and "condition:" not in line
        and "thoughtmlBinary" not in line
    ]
    check(
        "M and T are otherwise identical",
        m_lines == t_lines,
        "\n".join(
            "    %-40s | %s" % (a, b)
            for a, b in zip(m_lines, t_lines)
            if a != b
        ),
    )
    for key in ("maxStateBytes", "maxContextChars", "historyLimit", "recoveryGuidance"):
        check(
            "M and T share the same %s budget" % key,
            [line for line in patches["M"].splitlines() if key in line]
            == [line for line in patches["T"].splitlines() if key in line],
        )

    print("install spec")
    for code, agent in agents.items():
        spec = agent.install_spec()
        blob = "\n".join(step.run for step in spec.steps)
        check("%s installs a pinned DSH" % code, "@deepseek-ai/dsh@0.1.1-rc.2" in blob)
        check("%s installs Node at build time" % code, "nodesource" in blob or "nodejs" in blob)
        check(
            "%s prepares plugin dependencies at build time" % code,
            "npm install --prefix" in blob,
        )
        check("%s warms DSH_HOME at build time" % code, "--dump-config" in blob)
        check(
            "%s creates the state root at build time" % code,
            STATE_ROOT in blob,
        )
        check("%s has a verification command" % code, bool(spec.verification_command))

    print("validity threats disabled (regression: probe 2026-08-25 found both)")
    # Web search resolves via the allowlisted model-API host even in a
    # no-network container, and DeepSWE publishes solution.patch publicly.
    # todo_write and the goal tool are competing persistent scratchpads.
    must_disable = ("web", "web-search-deepseek", "tool-web", "tool-todo", "tool-goal")
    for code, patch in patches.items():
        for plugin_id in must_disable:
            block = "- id: %s\n  disabled: true" % plugin_id
            check("%s disables %s" % (code, plugin_id), block in patch)
    check(
        "all three conditions disable exactly the same plugins",
        len({
            tuple(
                line
                for line in patch.splitlines()
                if line.startswith("- id: ") or line.strip() == "disabled: true"
            )
            for patch in patches.values()
        })
        == 1,
    )

    print("filtered egress (regression: smoke run 2026-08-25 failed here)")
    for code, agent in agents.items():
        blob = "\n".join(step.run for step in agent.install_spec().steps)
        check(
            "%s installs Node 24, which can honour proxy env vars" % code,
            "setup_24.x" in blob,
            blob[:200],
        )

    os.environ["DEEPSEEK_API_KEY"] = "selftest-placeholder-not-a-real-key"
    try:
        for code, agent in agents.items():
            env = agent.build_run_env()
            check(
                "%s enables Node env-proxy support" % code,
                env.get("NODE_USE_ENV_PROXY") == "1",
                str(env.get("NODE_USE_ENV_PROXY")),
            )
            check("%s disables telemetry at run time" % code,
                  env.get("DSH_TELEMETRY_MODE") == "DISABLED")
            check("%s points DSH at the prepared home" % code,
                  env.get("DSH_HOME") == "/opt/dsh-home")
        del os.environ["DEEPSEEK_API_KEY"]
        try:
            agents["D"].build_run_env()
            check("missing credential fails loudly", False, "no error raised")
        except ValueError:
            check("missing credential fails loudly", True)
    finally:
        os.environ.pop("DEEPSEEK_API_KEY", None)

    print("provider routing (study pin vs development runs)")
    for agent in agents.values():
        check(
            "%s is recognised as the pinned study model" % agent.condition,
            agent.is_study_model is True,
        )
    dev = DshAgent(
        logs_dir=tmp / "logs-dev",
        condition="T",
        model_name="openrouter/some-vendor/some-model",
        thoughtml_binary=str(fake_checker),
        context_window=1048576,
        max_tokens=32768,
    )
    check("a non-pinned model is flagged as development", dev.is_study_model is False)
    check("development runs are labelled in the agent name",
          dev.to_agent_info().name.endswith("-dev"))
    check("study runs are not labelled -dev",
          not agents["T"].to_agent_info().name.endswith("-dev"))
    check(
        "openrouter allowlists its own host and not deepseek",
        dev.network_allowlist().domains == ["openrouter.ai"],
        str(dev.network_allowlist().domains),
    )
    dev_patch = dev._render_patch()
    check("openrouter route is declared on the pi-ai adapter",
          "- id: llm-pi-ai" in dev_patch and "openrouter:" in dev_patch)
    check("the development model is declared explicitly",
          "- id: 'some-vendor/some-model'" in dev_patch)
    check("declared model carries its context window",
          "contextWindow: 1048576" in dev_patch)
    check("the pinned study model needs no pi-ai route",
          "- id: llm-pi-ai" not in patches["T"])
    check(
        "development runs disable the same validity threats",
        all(("- id: %s\n  disabled: true" % p) in dev_patch for p in must_disable),
    )
    try:
        DshAgent(logs_dir=tmp / "logs-bad", condition="D", model_name="nope/model")
        check("unknown provider is rejected", False, "no error raised")
    except ValueError:
        check("unknown provider is rejected", True)

    os.environ.pop("DEEPSEEK_API_KEY", None)
    os.environ["OPENROUTER_API_KEY"] = "selftest-placeholder-not-a-real-key"
    try:
        env = dev.build_run_env()
        check("openrouter run uses OPENROUTER_API_KEY",
              env.get("OPENROUTER_API_KEY") == "selftest-placeholder-not-a-real-key")
        check("openrouter run does not require a deepseek key",
              "DEEPSEEK_API_KEY" not in env)
    finally:
        os.environ.pop("OPENROUTER_API_KEY", None)

    print("accounting")
    import json

    from pier.models.agent.context import AgentContext

    agent = agents["T"]
    metrics = agent.logs_dir / "metrics"
    metrics.mkdir(parents=True, exist_ok=True)
    (metrics / "metrics-summary.json").write_text(
        json.dumps(
            {
                "telemetryMode": "DISABLED",
                "credentialPresent": False,
                "sessions": [
                    {
                        "steps": 6,
                        "inputTokens": 615,
                        "cacheReadTokens": 10,
                        "outputTokens": 58,
                        "reasoningTokens": 4,
                        "modelCalls": 6,
                        "toolCalls": 5,
                        "failedToolCalls": 1,
                        "repeatedActions": 0,
                        "repeatedFailedActions": 0,
                        "recoveryEpisodesStarted": 1,
                        "recoveryEpisodesCompleted": 1,
                        "stateReads": 1,
                        "stateCommits": 1,
                        "stateCommitRejections": 0,
                        "stateCheckpointsAfterFailure": 1,
                    },
                    {
                        "steps": 2,
                        "inputTokens": 100,
                        "cacheReadTokens": 5,
                        "outputTokens": 7,
                        "reasoningTokens": 1,
                        "modelCalls": 2,
                        "toolCalls": 1,
                        "failedToolCalls": 0,
                        "repeatedActions": 0,
                        "repeatedFailedActions": 0,
                        "recoveryEpisodesStarted": 0,
                        "recoveryEpisodesCompleted": 0,
                        "stateReads": 0,
                        "stateCommits": 0,
                        "stateCommitRejections": 0,
                        "stateCheckpointsAfterFailure": 0,
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    ctx = AgentContext()
    agent.populate_context_post_run(ctx)
    check("sums input tokens across sessions", ctx.n_input_tokens == 715, str(ctx.n_input_tokens))
    check("sums output tokens across sessions", ctx.n_output_tokens == 65, str(ctx.n_output_tokens))
    check("sums cache tokens across sessions", ctx.n_cache_tokens == 15, str(ctx.n_cache_tokens))
    check("sums agent steps across sessions", ctx.n_agent_steps == 8, str(ctx.n_agent_steps))
    check(
        "does not invent a context high-water mark",
        ctx.peak_context_tokens is None,
    )
    check(
        "carries study measures into metadata",
        (ctx.metadata or {}).get("recovery_episodes_started") == 1
        and (ctx.metadata or {}).get("state_commits") == 1,
    )

    ctx2 = AgentContext()
    agents["D"].populate_context_post_run(ctx2)
    check("missing metrics leaves the context empty rather than failing", ctx2.is_empty())

    print()
    if FAILURES:
        print("FAILED %d check(s):" % len(FAILURES))
        for name in FAILURES:
            print("  - %s" % name)
        return 1
    print("all checks passed")
    print("artifacts in %s" % tmp)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
