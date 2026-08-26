"""Gate 7: build the authoritative byte-sensitive manifest for case study 01.

Records the hash or pinned identifier of everything that can change a result:
the protocol and schedule, the Pier adapter, the plugin sources, the ThoughtML
checker binary, the task definition, the container image digest, and the
toolchain versions actually present on the execution host.

Run this on the execution host (inside WSL), because it probes the live
toolchain rather than trusting notes:

    python3 make_manifest.py --repo /mnt/c/Users/Fatin/Downloads/tml2 \
        --thoughtml /root/tml-bin/thoughtml \
        --task /root/deep-swe/tasks/cattrs-partial-structuring-recovery

Writes manifest.json next to this file. Reads only; no model call, and it never
reads or records any credential.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEST = HERE / "manifest.json"

# Files whose bytes can change a study result.
ADAPTER_FILES = (
    "study/dsh/pier_agent/dsh_agent.py",
    "study/dsh/pier_agent/selftest.py",
    "study/dsh/pier_agent/verify_extraction.py",
)
PLUGIN_FILES = (
    "integrations/dsh/src/index.js",
    "integrations/dsh/src/metrics.js",
    "integrations/dsh/src/store.js",
    "integrations/dsh/src/formats.js",
    "integrations/dsh/package.json",
    "study/dsh/plugins/event-logger.js",
)
PROTOCOL_FILES = (
    "study/dsh/case-study-01/protocol.md",
    "study/dsh/case-study-01/schedule.json",
    "study/dsh/case-study-01/make_schedule.py",
    # The runner builds the exact pier commands, so its bytes can change a result.
    "study/dsh/case-study-01/run_case_study.py",
    # The analysis generator decides what the reported numbers are, and the
    # requirement list is frozen before collection so per-requirement scoring
    # cannot be shaped by what agents happened to miss.
    "study/dsh/case-study-01/analyze.py",
    "study/dsh/case-study-01/requirements.md",
    "study/dsh-agent-utility-amendment.md",
    "study/dsh/task-selection/README.md",
    "study/dsh/task-selection/select_candidate.py",
    "study/dsh/task-selection/data/provenance.json",
)
TASK_FILES = ("task.toml", "instruction.md", "tests/test.sh", "environment/Dockerfile")

# Pinned identifiers that must not drift.
PINNED = {
    "dsh_npm_package": "@deepseek-ai/dsh",
    "dsh_version": "0.1.1-rc.2",
    "dsh_registry_integrity": (
        "sha512-UP1UIh6q3Gme/yXRn/QL2P8IsVlv8Shpg22TRJIZPsCRWLm4CBiA1MUvXmJAfsOE"
        "ETBMLAl+xWPtFw6ICsN3wg=="
    ),
    "model_provider": "deepseek-official",
    "model": "deepseek-v4-flash",
    "task_id": "cattrs-partial-structuring-recovery",
    "task_base_commit": "6bc4708fb9b2ac52d9a18997e923da6a58916102",
    "deepswe_dataset": "v1.1",
    "deepswe_task_repo_commit": "435ee89ec2f2e2289f33b0da4f992f0b7b7266b9",
    "agent_image": (
        "public.ecr.aws/d3j8x8q7/swe-bench-202605:"
        "kh7f7cahc5ddm1qzpxz13kpmrh8235pc-v1.1"
    ),
    "agent_image_manifest_digest": (
        "sha256:443a3534dab64283e5a9dedf3b7ac8867ed7d5dabcde39bc39c77ab5a909176a"
    ),
    "memory_enforcement_policy": "ignore",
    "telemetry": "DSH_TELEMETRY_MODE=DISABLED",
}


def sha256_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def hash_group(root: Path, names) -> dict:
    out = {}
    for name in names:
        p = root / name
        digest = sha256_file(p)
        out[name] = (
            {"sha256": digest, "bytes": p.stat().st_size}
            if digest
            else {"sha256": None, "bytes": None, "missing": True}
        )
    return out


def run(cmd: list[str]) -> str | None:
    exe = shutil.which(cmd[0])
    if not exe:
        return None
    try:
        r = subprocess.run(
            [exe, *cmd[1:]], capture_output=True, text=True, timeout=120
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0:
        return None
    return (r.stdout or r.stderr).strip().splitlines()[0] if (r.stdout or r.stderr) else None


def toolchain() -> dict:
    return {
        "docker": run(["docker", "--version"]),
        "pier": run(["pier", "--version"]),
        "python": run(["python3", "--version"]),
        "node": run(["node", "--version"]),
        "rustc": run(["rustc", "--version"]),
        "cargo": run(["cargo", "--version"]),
        "os_release": run(["bash", "-c", "grep PRETTY_NAME /etc/os-release"]),
        "kernel": run(["uname", "-sr"]),
    }


def local_image_digest(image: str) -> str | None:
    out = run(["docker", "image", "inspect", image, "--format", "{{index .RepoDigests 0}}"])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", type=Path, required=True, help="ThoughtML repo root")
    ap.add_argument("--thoughtml", type=Path, help="Linux thoughtml binary for condition T")
    ap.add_argument("--task", type=Path, help="the frozen DeepSWE task directory")
    args = ap.parse_args()

    manifest = {
        "manifest": "dsh-case-study-01 authoritative byte-sensitive manifest",
        "protocol_version": "1.0",
        "status": "pre-collection freeze",
        "pinned": dict(PINNED),
        "protocol_and_selection": hash_group(args.repo, PROTOCOL_FILES),
        "adapter": hash_group(args.repo, ADAPTER_FILES),
        "plugin": hash_group(args.repo, PLUGIN_FILES),
        "toolchain_observed": toolchain(),
    }

    if args.thoughtml:
        manifest["thoughtml_checker"] = {
            "path": str(args.thoughtml),
            "sha256": sha256_file(args.thoughtml),
            "bytes": args.thoughtml.stat().st_size if args.thoughtml.is_file() else None,
            "version": run([str(args.thoughtml), "--version"]),
        }

    if args.task:
        manifest["task_files"] = hash_group(args.task, TASK_FILES)

    # Tri-state on purpose. Pier deletes environments after a trial, so the base
    # image is often absent between runs; "absent" is not the same as "mismatch"
    # and must not be recorded as one. The pin itself was confirmed against the
    # registry at pull time (docker pull reported this digest) and is
    # re-checkable with:
    #   docker manifest inspect <agent_image>
    resolved = local_image_digest(PINNED["agent_image"])
    expected = PINNED["agent_image_manifest_digest"]
    manifest["agent_image_local_repo_digest"] = resolved
    if resolved is None:
        manifest["agent_image_digest_check"] = "not-present-locally"
    elif expected.split(":", 1)[1] in resolved:
        manifest["agent_image_digest_check"] = "matches-pin"
    else:
        manifest["agent_image_digest_check"] = "MISMATCH"

    missing = [
        "%s/%s" % (group, name)
        for group in ("protocol_and_selection", "adapter", "plugin", "task_files")
        for name, meta in (manifest.get(group) or {}).items()
        if meta.get("missing")
    ]
    manifest["missing_files"] = missing
    manifest["complete"] = not missing

    DEST.write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    print("wrote", DEST)
    print("image digest check:", manifest["agent_image_digest_check"])
    if manifest["agent_image_digest_check"] == "MISMATCH":
        print("REFUSING: local image does not match the pinned digest")
        return 1
    if missing:
        print("MISSING (%d):" % len(missing))
        for name in missing:
            print("  -", name)
        return 1
    print("all hashed files present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
