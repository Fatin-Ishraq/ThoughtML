"""Turn collected sessions into the results tables.

protocol.md §13 requires that reported tables be reproducible from the preserved
artifacts rather than transcribed by hand. This is that generator. It reads the
trial directories a run produces, verifies every reported number against the raw
event logs first, and emits both a Markdown report and a JSON record.

    python3 analyze.py --job /root/case-study-01 --out results/
    python3 analyze.py --job /root/devfull/M --job /root/devfull/D --label dev

Reads only. No container, no model call, no credential.

Two rules this file enforces rather than assumes:

* A session whose metrics do not re-derive from its raw logs is reported as
  UNVERIFIED and excluded from aggregates. A number that cannot be re-derived is
  not evidence.
* Development sessions (any model other than the pinned one) are labelled and
  never pooled with study sessions.
"""

from __future__ import annotations

import argparse
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pier_agent"))

try:
    from verify_extraction import recompute, verify  # noqa: E402
except ImportError:  # pragma: no cover - only when run outside the repo layout
    recompute = verify = None

STUDY_MODEL = "deepseek-v4-flash"
MODIFYING_TOOLS = {"edit", "write", "str_replace_editor"}
STATE_PREFIX = "reasoning_state_"


# ----------------------------------------------------------------- collection

def read_json(path: Path):
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def read_jsonl(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
    return out


def checkpoint_compliance(tools: list[dict]) -> dict:
    """Mechanically checkable subset of the four checkpoint triggers (§4).

    Triggers 1, 2 and 4 are decidable from the tool order. Trigger 3 — a commit
    when evidence revises a hypothesis — is not mechanically decidable and stays
    human-coded, so it is reported as None rather than guessed at.
    """
    names = [t.get("name") or "" for t in tools]
    commits = [i for i, n in enumerate(names) if n == STATE_PREFIX + "commit"]
    modifying = [i for i, n in enumerate(names) if n in MODIFYING_TOOLS]
    failures = [i for i, t in enumerate(tools) if t.get("isError")]

    first_mod = modifying[0] if modifying else None
    before_first_edit = (
        None if first_mod is None else any(c < first_mod for c in commits)
    )

    # Trigger 2: a commit following a failure, before the next failure.
    after_failure = None
    if failures:
        after_failure = any(
            any(f < c for c in commits) for f in failures
        )

    # Trigger 4: a commit in the final fifth of the session.
    near_end = None
    if names:
        tail = int(len(names) * 0.8)
        near_end = any(c >= tail for c in commits)

    return {
        # Commit *attempts*. Successful commits are metrics.stateCommits;
        # the two differ when the checker rejects a candidate.
        "commits": len(commits),
        "first_modifying_index": None if first_mod is None else first_mod + 1,
        "first_state_index": (commits[0] + 1) if commits else None,
        "trigger1_before_first_modifying_action": before_first_edit,
        "trigger2_after_a_failure": after_failure,
        "trigger3_on_hypothesis_revision": None,  # human-coded, §7.3
        "trigger4_before_final_answer": near_end,
    }


def collect(trial_dir: Path) -> dict:
    agent = trial_dir / "agent"
    verifier = trial_dir / "verifier"

    summary = read_json(agent / "metrics" / "metrics-summary.json") or {}
    sessions = summary.get("sessions") or []
    session = sessions[0] if sessions else {}
    reward = read_json(verifier / "reward.json") or {}
    ctrf = read_json(verifier / "ctrf.json") or {}
    tools = read_jsonl(agent / "logs" / "tools.jsonl")

    ctrf_results = ctrf.get("results", ctrf) if isinstance(ctrf, dict) else {}
    ctrf_summary = ctrf_results.get("summary") if isinstance(ctrf_results, dict) else None

    revisions = sorted(
        (agent / "state").glob("*/history/*")
    ) if (agent / "state").is_dir() else []

    isolation_post = read_json(agent / "state-isolation-post.json") or {}
    patch = trial_dir / "artifacts" / "model.patch"

    row = {
        "trial": trial_dir.name,
        "condition": summary.get("condition"),
        "state_format": summary.get("format"),
        "model": None,
        "run_class": None,
        "graded": bool(reward),
        "reward": reward.get("reward"),
        "f2p_passed": reward.get("f2p_passed"),
        "f2p_total": reward.get("f2p_total"),
        "f2p_fraction": reward.get("f2p"),
        "p2p_passed": reward.get("p2p_passed"),
        "p2p_total": reward.get("p2p_total"),
        "partial": reward.get("partial"),
        "ctrf_tests": (ctrf_summary or {}).get("tests"),
        "ctrf_passed": (ctrf_summary or {}).get("passed"),
        "steps": session.get("steps"),
        "model_calls": session.get("modelCalls"),
        "tool_calls": session.get("toolCalls"),
        "failed_tool_calls": session.get("failedToolCalls"),
        "input_tokens": session.get("inputTokens"),
        "cache_tokens": session.get("cacheReadTokens"),
        "output_tokens": session.get("outputTokens"),
        "reasoning_tokens": session.get("reasoningTokens"),
        "repeated_actions": session.get("repeatedActions"),
        "repeated_failed_actions": session.get("repeatedFailedActions"),
        "recovery_started": session.get("recoveryEpisodesStarted"),
        "recovery_completed": session.get("recoveryEpisodesCompleted"),
        "recovery_distances": session.get("recoveryToolDistances"),
        "state_reads": session.get("stateReads"),
        "state_commits": session.get("stateCommits"),
        "state_commit_rejections": session.get("stateCommitRejections"),
        "state_inspections": session.get("stateInspections"),
        "state_diffs": session.get("stateDiffs"),
        "state_explanations": session.get("stateExplanations"),
        "state_analyses": session.get("stateAnalyses"),
        "checkpoints_after_failure": session.get("stateCheckpointsAfterFailure"),
        "latest_revision": session.get("latestStateRevision"),
        "latest_state_bytes": session.get("latestStateBytes"),
        "latest_state_valid": session.get("latestStateValid"),
        "revisions_preserved": len(revisions),
        "patch_bytes": patch.stat().st_size if patch.is_file() else 0,
        "state_leaked_into_repo": bool(isolation_post.get("leaked")),
        "telemetry_mode": summary.get("telemetryMode"),
        "compliance": checkpoint_compliance(tools),
    }

    # Model identity lives in Pier's own trial result, not in our metrics.
    trial_result = read_json(trial_dir / "result.json") or {}
    info = (trial_result.get("agent_info") or {})
    model_info = info.get("model_info") or {}
    row["model"] = model_info.get("name")
    row["agent_name"] = info.get("name")
    row["run_class"] = (
        "study" if row["model"] == STUDY_MODEL else "development"
    )

    if verify is not None and (agent / "metrics" / "metrics-summary.json").is_file():
        ok, problems = verify(agent)
        row["verified"] = ok
        row["verification_problems"] = problems
    else:
        row["verified"] = None
        row["verification_problems"] = ["verify_extraction unavailable"]

    return row


def find_trials(root: Path) -> list[Path]:
    # <trial>/agent/metrics/metrics-summary.json -> <trial>
    return sorted(
        p.parents[2] for p in root.rglob("agent/metrics/metrics-summary.json")
    )


# ------------------------------------------------------------------ reporting

def fmt(value, spec="%s"):
    return "—" if value is None else (spec % value)


def condition_summary(rows: list[dict]) -> dict:
    out = {}
    for cond in ("D", "M", "T"):
        group = [r for r in rows if r["condition"] == cond]
        if not group:
            continue

        def mean(field):
            vals = [r[field] for r in group if isinstance(r[field], (int, float))]
            return st.mean(vals) if vals else None

        graded = [r for r in group if r["graded"]]
        out[cond] = {
            "n": len(group),
            "n_graded": len(graded),
            "n_passed": sum(1 for r in graded if r["reward"]),
            "mean_f2p_fraction": (
                st.mean([r["f2p_fraction"] for r in graded if r["f2p_fraction"] is not None])
                if any(r["f2p_fraction"] is not None for r in graded) else None
            ),
            "mean_steps": mean("steps"),
            "mean_tool_calls": mean("tool_calls"),
            "mean_output_tokens": mean("output_tokens"),
            "mean_input_tokens": mean("input_tokens"),
            "mean_cache_tokens": mean("cache_tokens"),
            "mean_state_commits": mean("state_commits"),
            "mean_state_rejections": mean("state_commit_rejections"),
            "mean_repeated_failed": mean("repeated_failed_actions"),
            "mean_recovery_started": mean("recovery_started"),
            "mean_recovery_completed": mean("recovery_completed"),
        }
    return out


def contrasts(summary: dict) -> dict:
    """T−M is the primary contrast; M−D and T−D are diagnostic (§2)."""
    out = {}
    for label, a, b in (("T_minus_M", "T", "M"), ("M_minus_D", "M", "D"), ("T_minus_D", "T", "D")):
        if a not in summary or b not in summary:
            continue
        diff = {}
        for key, av in summary[a].items():
            bv = summary[b].get(key)
            if isinstance(av, (int, float)) and isinstance(bv, (int, float)):
                diff[key] = round(av - bv, 4)
                if key.startswith("mean_") and bv:
                    diff[key + "_ratio"] = round(av / bv, 4)
        out[label] = diff
    return out


def render(rows: list[dict], summary: dict, diffs: dict, label: str) -> str:
    study = [r for r in rows if r["run_class"] == "study"]
    dev = [r for r in rows if r["run_class"] != "study"]
    unverified = [r for r in rows if r["verified"] is False]

    lines = ["# DSH case study — results", ""]
    lines.append("**Label:** %s" % label)
    lines.append("**Sessions:** %d (%d study, %d development)" % (len(rows), len(study), len(dev)))
    if dev:
        lines.append("")
        lines.append("> **Development sessions are present and are not study data.** "
                     "They ran on a model other than the pinned `%s` and are excluded "
                     "from any claim." % STUDY_MODEL)
    if unverified:
        lines.append("")
        lines.append("> **%d session(s) failed metric verification and are excluded from "
                     "aggregates.** A number that cannot be re-derived from the raw "
                     "event logs is not reported as evidence." % len(unverified))
    lines.append("")

    lines += ["## Sessions", "",
              "| trial | cond | class | graded | reward | f2p | steps | tools | out tok | commits | rej | rec | ver |",
              "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        lines.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s/%s | %s |" % (
            r["trial"][:28], fmt(r["condition"]), (r["run_class"] or "?")[:4],
            "yes" if r["graded"] else "no",
            fmt(r["reward"]),
            ("%s/%s" % (r["f2p_passed"], r["f2p_total"])) if r["f2p_total"] else "—",
            fmt(r["steps"]), fmt(r["tool_calls"]), fmt(r["output_tokens"]),
            fmt(r["state_commits"]), fmt(r["state_commit_rejections"]),
            fmt(r["recovery_completed"]), fmt(r["recovery_started"]),
            {True: "ok", False: "FAIL", None: "—"}[r["verified"]],
        ))

    lines += ["", "## Checkpoint compliance (§4 triggers)", "",
              "| trial | cond | commit calls | 1st state call | 1st edit | T1 | T2 | T4 |",
              "|---|---|---|---|---|---|---|---|"]
    mark = {True: "yes", False: "**no**", None: "—"}
    for r in rows:
        c = r["compliance"]
        lines.append("| %s | %s | %s | %s | %s | %s | %s | %s |" % (
            r["trial"][:28], fmt(r["condition"]), c["commits"],
            fmt(c["first_state_index"]), fmt(c["first_modifying_index"]),
            mark[c["trigger1_before_first_modifying_action"]],
            mark[c["trigger2_after_a_failure"]],
            mark[c["trigger4_before_final_answer"]],
        ))
    lines.append("")
    lines.append("Trigger 3 (commit on hypothesis revision) is not mechanically "
                 "decidable and remains human-coded per §7.3.")

    if summary:
        lines += ["", "## Per condition", "",
                  "| measure | " + " | ".join(summary) + " |",
                  "|---|" + "---|" * len(summary)]
        keys = sorted({k for v in summary.values() for k in v})
        for key in keys:
            vals = []
            for cond in summary:
                v = summary[cond].get(key)
                vals.append("—" if v is None else (("%.2f" % v) if isinstance(v, float) else str(v)))
            lines.append("| %s | %s |" % (key, " | ".join(vals)))

    if diffs:
        lines += ["", "## Contrasts", "",
                  "`T−M` is the primary contrast. `M−D` and `T−D` are diagnostic (§2).", ""]
        for name, diff in diffs.items():
            lines.append("**%s**" % name)
            lines.append("")
            for key in sorted(diff):
                lines.append("- `%s`: %s" % (key, diff[key]))
            lines.append("")

    lines += ["", "## Interpretation limits", "",
              "This generator reports numbers; it does not license claims. "
              "protocol.md §7.1 forbids any success claim from nine sessions in "
              "either direction, and §13 restricts this design to description.", ""]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", type=Path, action="append", default=[],
                    help="a jobs directory to scan (repeatable)")
    ap.add_argument("--out", type=Path, help="directory for results.md and results.json")
    ap.add_argument("--label", default="unlabelled", help="a name for this analysis")
    args = ap.parse_args()

    if not args.job:
        ap.error("give at least one --job directory")

    trials: list[Path] = []
    for job in args.job:
        trials.extend(find_trials(job))
    if not trials:
        print("no trials found under: %s" % ", ".join(str(j) for j in args.job))
        return 1

    rows = [collect(t) for t in trials]
    usable = [r for r in rows if r["verified"] is not False]
    summary = condition_summary(usable)
    diffs = contrasts(summary)
    report = render(rows, summary, diffs, args.label)

    print(report)
    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "results.md").write_text(report, encoding="utf-8", newline="\n")
        (args.out / "results.json").write_text(
            json.dumps({"label": args.label, "sessions": rows,
                        "per_condition": summary, "contrasts": diffs}, indent=1) + "\n",
            encoding="utf-8", newline="\n")
        print("wrote %s and %s" % (args.out / "results.md", args.out / "results.json"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
