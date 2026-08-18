//! The book must not teach syntax the parser rejects.
//!
//! Every ```thml block in `docs/src/**` and in the embedded language brief is
//! extracted and parsed. Snippets are deliberately *fragments* — most reference
//! ids they do not declare — so unresolved references and orphans are expected and
//! only hard **errors** fail. That is still the check that matters: a snippet that
//! does not parse is a reader following instructions that cannot work.
//!
//! It also pins the tutorial's payoff to the file it claims to be building. The
//! tutorial tells the reader they are writing `pour-the-slab.thml`; this asserts
//! that the document it ends on really is that file, so the two cannot drift.

use std::fs;
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("repo root is two levels above the crate")
        .to_path_buf()
}

/// Every ```thml fenced block in `text`, with the 1-based line its fence opened on.
fn thml_blocks(text: &str) -> Vec<(usize, String)> {
    let mut out = Vec::new();
    let mut current: Option<(usize, String)> = None;
    for (i, line) in text.lines().enumerate() {
        match &mut current {
            None => {
                if line.trim_end() == "```thml" {
                    current = Some((i + 1, String::new()));
                }
            }
            Some((start, body)) => {
                if line.trim_end() == "```" {
                    out.push((*start, std::mem::take(body)));
                    current = None;
                } else {
                    body.push_str(line);
                    body.push('\n');
                }
            }
        }
    }
    out
}

fn markdown_files(dir: &Path, into: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            markdown_files(&path, into);
        } else if path.extension().is_some_and(|e| e == "md") {
            into.push(path);
        }
    }
}

#[test]
fn every_documented_snippet_parses() {
    let root = repo_root();
    let mut files = Vec::new();
    markdown_files(&root.join("docs/src"), &mut files);
    files.push(root.join("crates/thoughtml/llms.txt"));
    files.sort();
    assert!(
        files.len() > 10,
        "expected to find the book, found {files:?}"
    );

    let mut checked = 0;
    let mut failures = Vec::new();
    for path in &files {
        let Ok(text) = fs::read_to_string(path) else {
            continue;
        };
        for (line, snippet) in thml_blocks(&text) {
            checked += 1;
            let result = thoughtml::parse_str(&snippet);
            let errors: Vec<_> = result
                .diagnostics
                .items
                .iter()
                .filter(|d| d.severity == thoughtml::Severity::Error)
                .map(|d| d.message.clone())
                .collect();
            if !errors.is_empty() {
                let rel = path.strip_prefix(&root).unwrap_or(path);
                failures.push(format!("{}:{line} -> {errors:?}", rel.display()));
            }
        }
    }
    assert!(
        checked >= 60,
        "only {checked} snippets found; extraction is broken"
    );
    assert!(
        failures.is_empty(),
        "snippets that do not parse:\n{}",
        failures.join("\n")
    );
}

#[test]
fn the_tutorial_ends_on_the_file_it_promises() {
    let root = repo_root();
    let page =
        fs::read_to_string(root.join("docs/src/tutorial/the-mirror.md")).expect("tutorial finale");
    let shipped =
        fs::read_to_string(root.join("examples/pour-the-slab.thml")).expect("bundled example");
    // The shipped file opens with a comment header explaining itself; the tutorial
    // has spent seven chapters doing that instead.
    let body: String = shipped
        .lines()
        .filter(|l| !l.starts_with('#'))
        .collect::<Vec<_>>()
        .join("\n");
    let first = thml_blocks(&page)
        .into_iter()
        .next()
        .expect("the finale should show a document");
    assert_eq!(
        first.1.trim(),
        body.trim(),
        "the tutorial's finished document has drifted from examples/pour-the-slab.thml"
    );
}
