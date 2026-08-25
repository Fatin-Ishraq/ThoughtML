"""Execute the nine frozen sessions of DSH case study 01.

Reads schedule.json and runs each session in the frozen order, one at a time,
under the conditions and pins recorded in protocol.md. Refuses to start unless
the environment matches the freeze.

    python3 run_case_study.py --check      # pre-flight only, no model calls
    python3 run_case_study.py --run        # execute the nine sessions

Each session is a separate `pier run` against a fresh container. Results land in
--out/<session_id>/. A session that fails for infrastructure reasons is recorded
and the run continues; protocol.md §11 governs whether it may be repeated.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

DEFAULTS = {
    "task": "/root/deep-swe/tasks/cattrs-partial-structuring-recovery",
    "adapter": "/mnt/c/Users/Fatin/Downloads/tml2/study/dsh/pier_agent",
    "thoughtml": "/root/tml-bin/thoughtml",
    "env_file": "/mnt/c/Users/Fatin/Downloads/tml2/study/dsh/.env",
    "pier": "/root/.local/bin/pier",
    "out": "/root/case-study-01",
    "model": "deepseek-official/deepseek-v4-flash",
}


def preflight(cfg: dict) -> list[str]:
    """Checks that must pass before any study model call. See protocol.md §10."""
    problems = []

    task = Path(cfg["task"])
    if not (task / "task.toml").is_file():
        problems.append("task not found: %s" % task)
    else:
        # CRLF in the verifier entrypoint produces no reward.json at all, and
        # only surfaces after a full session has been spent. See protocol.md §6.
        test_sh = task / "tests" / "test.sh"
        if test_sh.is_file():
            raw = test_sh.read_bytes()
            if b"\r\n" in raw:
                problems.append(
                    "tests/test.sh has CRLF line endings; re-clone the task repo "
                    "natively on Linux (protocol.md §6)"
                )

    for key, label in (
        ("adapter", "adapter directory"),
        ("env_file", "credential env file"),
        ("pier", "pier executable"),
    ):
        if not Path(cfg[key]).exists():
            problems.append("%s not found: %s" % (label, cfg[key]))

    checker = Path(cfg["thoughtml"])
    if not checker.is_file():
        problems.append("thoughtml checker not found: %s (condition T needs it)" % checker)

    manifest = HERE / "manifest.json"
    if not manifest.is_file():
        problems.append("manifest.json missing; run make_manifest.py first")
    else:
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if not data.get("complete"):
            problems.append("manifest reports missing files: %s" % data.get("missing_files"))
        if data.get("agent_image_digest_check") == "MISMATCH":
            problems.append("local image does not match the pinned digest")

    schedule = HERE / "schedule.json"
    if not schedule.is_file():
        problems.append("schedule.json missing")
    else:
        check = subprocess.run(
            [sys.executable, str(HERE / "make_schedule.py"), "--check"],
            capture_output=True,
            text=True,
        )
        if check.returncode != 0:
            problems.append("schedule.json does not match its frozen seed")

    return problems


def build_command(cfg: dict, session: dict) -> list[str]:
    cmd = [
        cfg["pier"],
        "run",
        "-p", cfg["task"],
        "--agent-import-path", "dsh_agent:DshAgent",
        "--ak", "condition=%s" % session["condition"],
        "-m", cfg["model"],
        "--env", "docker",
        "--memory", "ignore",          # protocol.md deviation D2
        "--env-file", cfg["env_file"],
        "-o", str(Path(cfg["out"]) / session["session_id"]),
        "--job-name", session["session_id"],
        "-q",
    ]
    if session["condition"] == "T":
        cmd[cmd.index("--ak") + 2 : cmd.index("--ak") + 2] = []
        cmd += ["--ak", "thoughtml_binary=%s" % cfg["thoughtml"]]
    return cmd


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true", help="execute the sessions")
    ap.add_argument("--check", action="store_true", help="pre-flight only")
    for key, value in DEFAULTS.items():
        ap.add_argument("--%s" % key.replace("_", "-"), default=value)
    args = ap.parse_args()
    cfg = {key: getattr(args, key) for key in DEFAULTS}

    schedule = json.loads((HERE / "schedule.json").read_text(encoding="utf-8"))
    sessions = schedule["sessions"]

    print("DSH case study 01 — %d sessions, task %s" % (len(sessions), schedule["task"]))
    print("seed %s, block orders %s\n" % (schedule["seed"], schedule["block_orders"]))

    problems = preflight(cfg)
    if problems:
        print("PRE-FLIGHT FAILED (%d):" % len(problems))
        for p in problems:
            print("  -", p)
        return 1
    print("pre-flight: all checks passed")

    if not args.run:
        print("\nDry inspection only. Commands that would run:\n")
        for s in sessions:
            print("  %-18s %s" % (s["session_id"], " ".join(build_command(cfg, s))))
        print("\nRe-run with --run to execute. This spends model calls.")
        return 0

    out_root = Path(cfg["out"])
    out_root.mkdir(parents=True, exist_ok=True)
    log = out_root / "collection-log.jsonl"

    for i, session in enumerate(sessions, 1):
        cmd = build_command(cfg, session)
        print("\n[%d/%d] %s (condition %s)" % (i, len(sessions), session["session_id"], session["condition"]), flush=True)
        started = time.time()
        proc = subprocess.run(cmd, capture_output=True, text=True)
        elapsed = round(time.time() - started, 1)
        record = {
            "session_id": session["session_id"],
            "condition": session["condition"],
            "block": session["block"],
            "slot": session["slot"],
            "returncode": proc.returncode,
            "elapsed_sec": elapsed,
            "stdout_tail": (proc.stdout or "")[-4000:],
            "stderr_tail": (proc.stderr or "")[-2000:],
        }
        with log.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
        print("    exit=%s  %.1fs" % (proc.returncode, elapsed), flush=True)

    print("\ncollection complete; log at %s" % log)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
