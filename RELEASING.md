# Releasing ThoughtML

This is the maintainer checklist for a public release. It records the current
automation boundary so GitHub, npm, PyPI, crates.io, the book, and the playground
do not silently drift.

## 1. Prepare the release commit

- Set `[workspace.package].version` in `Cargo.toml`.
- Update `Cargo.lock`, the README version badge and Status section, the book's
  current-version references, `CHANGELOG.md`, and the PyPI workflow's manual
  dispatch default.
- Regenerate `crates/thoughtml/assets/viewer.html` with
  `cd web && npm run build:viewer` after any shared viewer change.
- Keep local demos, generated scratch files, and private test artifacts out of
  the release commit.

For v0.4.0, the expected release-facing version is:

```text
Cargo.toml                         0.4.0
Cargo.lock                        0.4.0 (thoughtml + thoughtml-wasm)
README.md                         version-0.4.0 badge / v0.4.0 Status
docs/src/introduction.md          v0.4.0
docs/src/reference/index.md       v0.4.0
docs/src/appendix/faq.md          v0.4.0
.github/workflows/pypi.yml        0.4.0 manual default
```

## 2. Run the release gate

From the repository root:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test -p thoughtml --all-features
cargo package -p thoughtml --allow-dirty

cd web
npm ci
npm run wasm
npm test
npm run build
npm run build:viewer
cd ..

cargo test -p thoughtml --test viewer_freshness
mdbook build docs
```

Then run `git diff --check`, inspect `git status`, and confirm that rebuilding the
viewer and book leaves no unexplained changes. Smoke-test at least one
single-file parse, the Snake multi-file entry, standalone HTML export, and a
local stream.

## 3. Commit, push, and tag

Commit the reviewed release set, push `main`, then create and push the matching
annotated tag:

```sh
git tag -a v0.4.0 -m "ThoughtML v0.4.0"
git push origin main
git push origin v0.4.0
```

Pushing the version tag starts cargo-dist. It builds macOS, Linux, and Windows
binaries, creates checksums and the npm package tarball, and publishes the GitHub
Release using `CHANGELOG.md` for the announcement.

## 4. Publish the package channels

- **PyPI:** automatic after the cargo-dist Release workflow completes
  successfully. The PyPI workflow builds platform wheels from the attached
  cargo-dist binaries, checks them with Twine, and publishes through Trusted
  Publishing (OIDC). No token is stored.
- **npm:** download the `thoughtml-npm-package.tar.gz` asset produced by
  cargo-dist and publish it manually with `npm publish <tarball>`.
- **crates.io:** publish the reference crate manually with
  `cargo publish -p thoughtml`. Do not publish `thoughtml-wasm` unless it becomes
  an intentional public package.
- **Book and playground:** pushing the release commit to `main` triggers the
  GitHub Pages workflow for both surfaces and `/llms.txt`.

Publishing changes external state. Perform these commands only after the tag's
release workflow and local release gate are green.

## 5. Verify the public release

- Install `thoughtml==0.4.0` into a clean Python environment and run
  `thoughtml --version`.
- Install `thoughtml@0.4.0` with npm and run `thoughtml --version`.
- Check the crates.io page and `cargo install thoughtml --version 0.4.0`.
- Download one GitHub binary archive and verify `thoughtml guide`, the Snake
  project, `--html`, and `stream` from outside the repository.
- Open the deployed book and playground, verify the displayed release version,
  and confirm the generated standalone viewer matches the playground behavior.
