//! Freshness guard for the standalone-viewer template.
//!
//! `--html` bakes a document's model into `assets/viewer.html`, which is embedded
//! at compile time via `include_str!`. That file is a *build product* of the web
//! package (`npm run build:viewer`), committed so `cargo build` works with no
//! Node installed. The risk: it goes stale when the viewer source changes but the
//! template isn't rebuilt.
//!
//! This test rebuilds the viewer from current source into a temp dir and compares
//! it byte-for-byte (line-endings normalized) against the committed template. It
//! **skips** (never fails) when the JS toolchain or `node_modules` is absent — so
//! offline `cargo test` and the Node-free CI job pass — and runs for real in the
//! `web` CI job, where Node and deps are present. There, a stale template can't be
//! merged.

use std::path::{Path, PathBuf};
use std::process::Command;

fn npm() -> &'static str {
    if cfg!(windows) {
        "npm.cmd"
    } else {
        "npm"
    }
}

#[test]
fn viewer_template_matches_source() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo = manifest
        .parent()
        .and_then(Path::parent)
        .expect("repo root is two levels above the crate")
        .to_path_buf();
    let web = repo.join("web");
    let committed = manifest.join("assets/viewer.html");

    // Skip cleanly when we can't rebuild — keeps `cargo test` green offline and in
    // the Node-free CI job. CI's web job (Node + `npm ci`) runs the real check.
    let have_npm = Command::new(npm())
        .arg("--version")
        .current_dir(&web)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !have_npm {
        eprintln!("skip: npm not available — viewer template freshness not verified");
        return;
    }
    if !web.join("node_modules").is_dir() {
        eprintln!("skip: web/node_modules missing — run `npm ci` in web/ to enable this guard");
        return;
    }

    // Rebuild into a throwaway dir under target/ (gitignored) so the test never
    // mutates the committed template.
    let out = repo.join("target/viewer-freshness");
    let status = Command::new(npm())
        .args(["run", "build:viewer", "--", "--outDir"])
        .arg(&out)
        .arg("--emptyOutDir")
        .current_dir(&web)
        .status()
        .expect("failed to run `npm run build:viewer`");
    assert!(status.success(), "viewer build failed");

    let fresh = std::fs::read_to_string(out.join("viewer.html"))
        .expect("read freshly built viewer template");
    let have = std::fs::read_to_string(&committed).expect("read committed viewer template");

    let norm = |s: &str| s.replace("\r\n", "\n");
    assert!(
        norm(&fresh) == norm(&have),
        "committed viewer template is stale.\n\
         Run `npm run build:viewer` in web/ and commit crates/thoughtml/assets/viewer.html.\n\
         (freshly built {} bytes vs committed {} bytes)",
        fresh.len(),
        have.len(),
    );
}
