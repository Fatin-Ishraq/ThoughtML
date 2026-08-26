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
import shutil
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


STUDY_MODEL = "deepseek-official/deepseek-v4-flash"
# One session needs room for the agent image's unique layers on top of the
# pinned base (~1 GiB), the build cache (a few GiB), and the verifier image
# build. With reclaim_images() running after every session that peak does not
# accumulate, so ~10 GiB is enough headroom. The 2026-08-26 failure happened
# with twelve stale 4.6 GiB images present, not because the host was small.
MIN_FREE_GIB = 10.0


def preflight(cfg: dict) -> list[str]:
    """Checks that must pass before any study model call. See protocol.md §10."""
    problems = []

    # protocol.md §5 pins the model, and §1/D-series require a dated amendment
    # to change it. Development runs on another provider (e.g. a free
    # OpenRouter route) are expected and useful, but they must never be
    # collected as the nine sessions.
    if cfg["model"] != STUDY_MODEL:
        problems.append(
            "model is %r but the protocol pins %r. Change it back, or amend the "
            "protocol with a dated deviation first. Development runs on other "
            "providers should be launched with pier directly, not through this "
            "runner." % (cfg["model"], STUDY_MODEL)
        )

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

    # A verifier image build needs headroom. Sessions are worthless if grading
    # cannot run, and the failure is silent, so refuse to start when tight.
    if free_gib() < MIN_FREE_GIB:
        problems.append(
            "only %.1f GiB free; need at least %.0f GiB of headroom for the "
            "verifier image build (a short host produces sessions that run to "
            "completion and then cannot be graded)"
            % (free_gib(), MIN_FREE_GIB)
        )

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
        cmd += ["--ak", "thoughtml_binary=%s" % cfg["thoughtml"]]
    return cmd


# The pinned task image is expensive to re-pull (~6 minutes) and must survive
# reclamation; everything Pier builds per trial must not.
PROTECTED_IMAGE_PREFIXES = ("public.ecr.aws/", "node:")


def reclaim_images(verbose: bool = True) -> None:
    """Remove per-trial images and build cache between sessions.

    Pier builds an agent image (~4.6 GB tagged) and an egress-proxy image per
    trial, plus a verifier image. `docker image prune` does not touch these
    because they are tagged, so across nine sessions they accumulate until the
    host runs short and the *verifier* image build fails. Observed 2026-08-26:
    a session whose agent completed and whose patch was collected produced no
    reward at all, surfacing only as "No reward file found" with an empty
    verifier stdout. That is a silent, late failure — the session is spent
    before anything looks wrong — so reclamation runs after every session
    rather than at the end.
    """
    listed = subprocess.run(
        ["docker", "images", "--format", "{{.Repository}}:{{.Tag}}"],
        capture_output=True, text=True,
    )
    if listed.returncode != 0:
        print("    (could not list docker images; skipping reclamation)")
        return

    doomed = [
        line.strip()
        for line in listed.stdout.splitlines()
        if line.strip()
        and not line.startswith(PROTECTED_IMAGE_PREFIXES)
        and "<none>" not in line
        and not line.startswith("hello-world")
    ]
    for image in doomed:
        subprocess.run(["docker", "rmi", "-f", image],
                       capture_output=True, text=True)
    subprocess.run(["docker", "builder", "prune", "-af"],
                   capture_output=True, text=True)
    if verbose:
        print("    reclaimed %d per-trial image(s) and the build cache" % len(doomed))


def free_gib() -> float:
    """Free space on the disk that actually constrains the run.

    Under WSL the Linux root is a sparse virtual disk and reports the host
    volume's *apparent* size — 947 GiB free while the Windows volume backing it
    had 11.9 GiB. Checking `/` would make the headroom guard useless, so prefer
    the Windows mount when it is present.
    """
    for path in ("/mnt/c", "/"):
        try:
            usage = shutil.disk_usage(path)
        except OSError:
            continue
        return usage.free / (1024 ** 3)
    return float("inf")


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
        reclaim_images()
        print("    %.1f GiB free" % free_gib(), flush=True)

    print("\ncollection complete; log at %s" % log)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
