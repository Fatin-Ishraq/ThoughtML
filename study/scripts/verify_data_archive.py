#!/usr/bin/env python3
"""Verify the versioned ThoughtML study-data archive without extracting it."""

from __future__ import annotations

import csv
import hashlib
import json
import tarfile
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "study" / "data"
PROVENANCE = DATA / "thoughtml-study-data-v1.provenance.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    provenance = json.loads(PROVENANCE.read_text(encoding="utf-8"))
    archive_info = provenance["archive"]
    archive = REPO / archive_info["path"]
    index_path = REPO / archive_info["index"]

    archive_hash = sha256_file(archive)
    if archive_hash != archive_info["sha256"]:
        raise SystemExit(
            f"archive SHA-256 mismatch: {archive_hash} != {archive_info['sha256']}"
        )

    with index_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    expected = {row["path"]: row for row in rows}

    seen: set[str] = set()
    with tarfile.open(archive, "r:gz") as bundle:
        members = [member for member in bundle.getmembers() if member.isfile()]
        for member in members:
            row = expected.get(member.name)
            if row is None:
                raise SystemExit(f"archive member missing from index: {member.name}")
            if member.name in seen:
                raise SystemExit(f"duplicate archive member: {member.name}")
            seen.add(member.name)
            if member.size != int(row["bytes"]):
                raise SystemExit(f"size mismatch: {member.name}")
            extracted = bundle.extractfile(member)
            if extracted is None:
                raise SystemExit(f"cannot read archive member: {member.name}")
            digest = hashlib.sha256()
            for chunk in iter(lambda: extracted.read(1024 * 1024), b""):
                digest.update(chunk)
            if digest.hexdigest() != row["sha256"]:
                raise SystemExit(f"SHA-256 mismatch: {member.name}")

    missing = sorted(set(expected) - seen)
    if missing:
        raise SystemExit(f"indexed paths missing from archive: {missing[:5]}")
    if len(seen) != archive_info["entries"]:
        raise SystemExit(
            f"entry-count mismatch: {len(seen)} != {archive_info['entries']}"
        )

    print(
        f"verified {len(seen)} files; archive SHA-256 {archive_hash}; "
        f"{archive.stat().st_size} bytes"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
