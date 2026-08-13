# PyPI packaging

ThoughtML is a Rust CLI, not a Python library — so `pip install thoughtml` should
put the **same binary** as every other channel on your `PATH`, with no compile and
no Python code. This directory builds the wheels that do that.

## How it works

[`build_wheels.py`](build_wheels.py) does **not** recompile anything. It downloads
the prebuilt binaries that `cargo-dist` already attached to the GitHub Release
(`v<version>`) and repackages each one into a platform-tagged wheel. The binary
goes in the wheel's `.data/scripts/` directory, so `pip install` drops `thoughtml`
straight onto `PATH` — the wheel carries no Python at all.

One binary → one wheel:

| Release binary | Wheel platform tag |
| --- | --- |
| `x86_64-apple-darwin` | `macosx_10_12_x86_64` |
| `aarch64-apple-darwin` | `macosx_11_0_arm64` |
| `x86_64-unknown-linux-gnu` | `manylinux_2_35_x86_64` |
| `aarch64-unknown-linux-gnu` | `manylinux_2_35_aarch64` |
| `x86_64-pc-windows-msvc` | `win_amd64` |

**The Linux floor is glibc 2.35** (the Ubuntu 22.04 the release is built on) — the
tag states that honestly. Systems below it (older Ubuntu/Debian, musl/Alpine) won't
match a wheel; there's no sdist, so on those `pip install` reports "no matching
distribution" — use `cargo install thoughtml` or `npm i -g thoughtml` instead.

## Build

```sh
python packaging/pypi/build_wheels.py          # reads the version from Cargo.toml
python -m twine check packaging/pypi/build/dist/*
```

Outputs to `packaging/pypi/build/dist/` (git-ignored).

## Publish

Publishing is automated by `.github/workflows/pypi.yml` after a GitHub Release
is published. The workflow uses PyPI Trusted Publishing (GitHub OIDC): there is
no stored username, password, or API token. A manual `workflow_dispatch` with
the release version is available for recovery after the GitHub assets exist.

## Releasing a new version

1. Cut the GitHub Release for the new tag (the `dist` workflow builds the binaries).
2. The PyPI workflow resolves the release tag, runs `build_wheels.py`, and checks
   every wheel with Twine.
3. Trusted Publishing uploads the checked wheels to PyPI.

If the release ever changes its Linux build environment, update the `manylinux_2_*`
tags in `build_wheels.py` to match the new glibc floor (it's in the release's npm
`package.json` under `glibcMinimum`).
