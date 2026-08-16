#!/usr/bin/env python3
"""Build PyPI wheels for the ThoughtML CLI from the prebuilt release binaries.

ThoughtML is a Rust CLI, not a Python package. Rather than recompile, this
repackages the *same* binaries that cargo-dist already built and attached to the
GitHub Release into platform-tagged wheels. Each wheel carries one binary in its
``.data/scripts/`` directory, so ``pip install thoughtml`` drops ``thoughtml``
straight onto the PATH — no Python code, no compile, no install-time download.

Every archive is verified against the release's own ``sha256.sum`` before it is
unpacked. This script runs in a job holding PyPI publish credentials, so what it
signs must provably be what CI built: a failed or missing checksum aborts the
build rather than shipping an unverified binary.

Usage (from anywhere):
    python packaging/pypi/build_wheels.py            # download + build all wheels
    python packaging/pypi/build_wheels.py --version 0.2.0

Output: packaging/pypi/build/dist/*.whl
Then:   python -m twine upload packaging/pypi/build/dist/*
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import tarfile
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
BUILD = HERE / "build"
DL = BUILD / "dl"
DIST = BUILD / "dist"

REPO_SLUG = "Fatin-Ishraq/ThoughtML"

# One entry per release artifact. `platform_tag` is the wheel platform tag; it
# must honestly reflect what the binary needs (the Linux floor is glibc 2.35,
# the Ubuntu 22.04 the release was built on — a lower tag would mis-install).
TARGETS = [
    # (release archive, member path inside it, binary name on disk, wheel platform tag)
    ("thoughtml-x86_64-apple-darwin.tar.xz",       "thoughtml", "thoughtml",     "macosx_10_12_x86_64"),
    ("thoughtml-aarch64-apple-darwin.tar.xz",      "thoughtml", "thoughtml",     "macosx_11_0_arm64"),
    ("thoughtml-x86_64-unknown-linux-gnu.tar.xz",  "thoughtml", "thoughtml",     "manylinux_2_35_x86_64"),
    ("thoughtml-aarch64-unknown-linux-gnu.tar.xz", "thoughtml", "thoughtml",     "manylinux_2_35_aarch64"),
    ("thoughtml-x86_64-pc-windows-msvc.zip",       "thoughtml.exe", "thoughtml.exe", "win_amd64"),
]

NAME = "thoughtml"
SUMMARY = "A plain-text language for reasoning you can check — reference parser and CLI toolchain."


def record_line(path: str, data: bytes) -> str:
    digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
    return f"{path},sha256={digest},{len(data)}"


def metadata(version: str, readme: str) -> str:
    return (
        "Metadata-Version: 2.1\n"
        f"Name: {NAME}\n"
        f"Version: {version}\n"
        f"Summary: {SUMMARY}\n"
        "Author: Fatin Ishraq\n"
        "License: MIT\n"
        "Project-URL: Homepage, https://fatin-ishraq.github.io/ThoughtML/\n"
        "Project-URL: Repository, https://github.com/Fatin-Ishraq/ThoughtML\n"
        "Project-URL: Documentation, https://fatin-ishraq.github.io/ThoughtML/\n"
        "Classifier: License :: OSI Approved :: MIT License\n"
        "Classifier: Environment :: Console\n"
        "Classifier: Topic :: Software Development\n"
        "Requires-Python: >=3.8\n"
        "Description-Content-Type: text/markdown\n"
        "\n" + readme
    )


def wheel_file(platform_tag: str) -> str:
    return (
        "Wheel-Version: 1.0\n"
        "Generator: thoughtml build_wheels.py\n"
        "Root-Is-Purelib: false\n"
        f"Tag: py3-none-{platform_tag}\n"
    )


def extract_binary(archive: Path, member: str, is_zip: bool) -> bytes:
    # Match the member exactly (allowing one leading directory component), not by
    # `endswith`. A bare suffix test would happily pick `evil/thoughtml` out of a
    # tampered archive; the checksum gate above makes that unreachable, but the
    # selector should not be the thing standing between us and a wrong binary.
    def matches(name: str) -> bool:
        parts = name.split("/")
        return name == member or (len(parts) == 2 and parts[1] == member)

    if is_zip:
        with zipfile.ZipFile(archive) as z:
            names = [n for n in z.namelist() if matches(n) and not n.endswith("/")]
            if len(names) != 1:
                raise SystemExit(f"{archive.name}: expected exactly one `{member}`, found {len(names)}")
            return z.read(names[0])
    with tarfile.open(archive, "r:xz") as t:
        members = [m for m in t.getmembers() if matches(m.name) and m.isfile()]
        if len(members) != 1:
            raise SystemExit(f"{archive.name}: expected exactly one `{member}`, found {len(members)}")
        return t.extractfile(members[0]).read()


def build_wheel(version: str, readme: str, archive: str, member: str, binname: str, platform_tag: str) -> Path:
    is_zip = archive.endswith(".zip")
    binary = extract_binary(DL / archive, member, is_zip)

    distinfo = f"{NAME}-{version}.dist-info"
    scripts_dir = f"{NAME}-{version}.data/scripts"
    script_path = f"{scripts_dir}/{binname}"
    meta = metadata(version, readme).encode()
    whl = wheel_file(platform_tag).encode()

    records = [
        record_line(script_path, binary),
        record_line(f"{distinfo}/METADATA", meta),
        record_line(f"{distinfo}/WHEEL", whl),
        f"{distinfo}/RECORD,,",
    ]
    record = ("\n".join(records) + "\n").encode()

    out = DIST / f"{NAME}-{version}-py3-none-{platform_tag}.whl"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        # The binary: mark it executable (0o755) so POSIX installs keep the bit.
        info = zipfile.ZipInfo(script_path)
        info.external_attr = (0o755 | 0o100000) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, binary)
        z.writestr(f"{distinfo}/METADATA", meta)
        z.writestr(f"{distinfo}/WHEEL", whl)
        z.writestr(f"{distinfo}/RECORD", record)
    return out


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_checksums(base: str) -> dict[str, str]:
    """The release's `sha256.sum`, parsed to {artifact name: hex digest}.

    cargo-dist publishes one unified checksum file per release alongside the
    archives. Everything this script republishes to PyPI is verified against it,
    so a tampered download — or a stale/poisoned file left in build/dl/ — cannot
    silently become a signed wheel. No checksum file means no publish.
    """
    url = f"{base}/sha256.sum"
    print(f"  fetching sha256.sum ...")
    try:
        with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310 (fixed https URL)
            text = response.read().decode("utf-8")
    except Exception as e:  # noqa: BLE001 — any failure here must stop the publish
        raise SystemExit(f"cannot fetch {url}: {e}\nRefusing to build unverified wheels.")

    sums: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # `sha256sum` format: "<hex>  name" (text) or "<hex> *name" (binary).
        digest, _, name = line.partition(" ")
        name = name.lstrip(" *")
        if len(digest) == 64 and name:
            sums[name] = digest.lower()
    if not sums:
        raise SystemExit(f"{url} contained no usable checksum lines; refusing to continue.")
    return sums


def download_release(version: str) -> None:
    DL.mkdir(parents=True, exist_ok=True)
    base = f"https://github.com/{REPO_SLUG}/releases/download/v{version}"
    sums = fetch_checksums(base)

    for archive, *_ in TARGETS:
        dest = DL / archive
        expected = sums.get(archive)
        if expected is None:
            raise SystemExit(
                f"{archive} has no entry in the release's sha256.sum; refusing to publish it."
            )

        if dest.exists():
            if sha256_of(dest) == expected:
                print(f"  have {archive}  (sha256 ok)")
                continue
            # A cached file that does not match is not trustworthy; replace it
            # rather than reuse it.
            print(f"  cached {archive} failed its checksum — re-downloading")
            dest.unlink()

        url = f"{base}/{archive}"
        print(f"  downloading {archive} ...")
        urllib.request.urlretrieve(url, dest)  # noqa: S310 (fixed https URL)

        actual = sha256_of(dest)
        if actual != expected:
            dest.unlink(missing_ok=True)
            raise SystemExit(
                f"checksum mismatch for {archive}\n"
                f"  expected {expected}\n"
                f"  actual   {actual}\n"
                "Refusing to package a binary that does not match the release manifest."
            )
        print(f"    sha256 ok")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default=None, help="release version (default: read from Cargo.toml)")
    args = ap.parse_args()

    version = args.version
    if version is None:
        for line in (REPO / "Cargo.toml").read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if s.startswith("version"):
                version = s.split("=", 1)[1].strip().strip('"')
                break
    if not version:
        raise SystemExit("could not determine version")

    readme = (REPO / "README.md").read_text(encoding="utf-8")

    print(f"ThoughtML PyPI wheels — v{version}")
    print("downloading release binaries:")
    download_release(version)

    DIST.mkdir(parents=True, exist_ok=True)
    for old in DIST.glob("*.whl"):
        old.unlink()

    print("building wheels:")
    for archive, member, binname, platform_tag in TARGETS:
        out = build_wheel(version, readme, archive, member, binname, platform_tag)
        print(f"  {out.name}  ({out.stat().st_size // 1024} KiB)")

    print(f"\nDone. Wheels in {DIST}")
    print("Verify:  python -m twine check packaging/pypi/build/dist/*")
    print("Upload:  python -m twine upload packaging/pypi/build/dist/*")


if __name__ == "__main__":
    main()
