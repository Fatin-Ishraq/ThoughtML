//! Enforcement for the promises in STABILITY.md.
//!
//! A compatibility policy that nothing checks is a wish. These tests make two of
//! them mechanical: the closed vocabulary is pinned element by element, and the
//! canonical model of every bundled example is snapshotted. Both are meant to
//! *fail* when someone changes the language — the failure is the review prompt.
//! Updating the expected values is a deliberate edit, which is the point: a change
//! to the surface should be an argument someone makes, not a side effect.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("repo root is two levels above the crate")
        .to_path_buf()
}

/// The language as of the 1.0 freeze. Written out longhand rather than derived
/// from `vocab`, so that changing `vocab` cannot silently change what is checked.
#[test]
fn the_closed_vocabulary_is_frozen() {
    let expect = |label: &str, actual: &[&str], want: &[&str]| {
        let actual: BTreeSet<&str> = actual.iter().copied().collect();
        let want: BTreeSet<&str> = want.iter().copied().collect();
        let removed: Vec<_> = want.difference(&actual).collect();
        let added: Vec<_> = actual.difference(&want).collect();
        assert!(
            removed.is_empty(),
            "{label}: {removed:?} disappeared. Removing a word from a closed set breaks \
             every document that uses it — see STABILITY.md."
        );
        assert!(
            added.is_empty(),
            "{label}: {added:?} was added. That is allowed in a minor release, but it is a \
             language change: update this list in the same commit so the addition is on the record."
        );
    };

    expect(
        "kinds",
        thoughtml::vocab::KINDS,
        &[
            "observation",
            "claim",
            "hypothesis",
            "option",
            "decision",
            "outcome",
            "goal",
            "memory",
            "assumption",
            "action",
        ],
    );
    expect(
        "relations",
        thoughtml::vocab::RELATIONS,
        &[
            "supports",
            "opposes",
            "undercuts",
            "answers",
            "causes",
            "enables",
            "prevents",
            "depends-on",
            "blocks",
            "revises",
            "leads-to",
            "option-of",
            "part-of",
            "candidate-for",
        ],
    );
    expect(
        "postures",
        thoughtml::vocab::POSTURES,
        &[
            "noticed",
            "considers",
            "suspects",
            "infers",
            "asks",
            "holds",
            "chooses",
            "rejects",
            "revises",
            "remembers",
            "doubts",
            "accepts",
        ],
    );
    expect(
        "bases",
        thoughtml::vocab::BASES,
        &["measured", "estimated", "assumed"],
    );
    expect(
        "lifecycle",
        thoughtml::vocab::LIFECYCLE,
        &["open", "settled", "superseded", "abandoned"],
    );
    expect(
        "fields",
        thoughtml::vocab::FIELDS,
        &[
            "note",
            "kind",
            "quantity",
            "about",
            "weight",
            "probability",
            "confidence",
            "because",
            "answers",
            "expects",
            "status",
            "until",
            "source",
            "observed-at",
            "asserted-at",
            "valid-during",
            "noted-by",
            "noticed-by",
            "suspected-by",
            "chosen-by",
            "blocked-by",
            "undercut-by",
            "kinds",
            "relations",
            "fields",
            "postures",
        ],
    );
}

/// A dateless document is not second-class and never becomes invalid. Called out
/// in STABILITY.md because the time model is the part most likely to grow.
#[test]
fn a_dateless_document_stays_first_class() {
    let src = "claim a\n  A claim with no dates anywhere.\n\nobservation b\n  Something seen.\n\nlink b supports a\n\nreader holds a\n  confidence 0.6 estimated\n";
    let r = thoughtml::parse_str(src);
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    assert!(!r.diagnostics.has_warnings(), "{:?}", r.diagnostics.items);
}

/// Line endings are not model changes.
fn normalize(s: &str) -> String {
    s.replace(
        "
", "
",
    )
    .trim()
    .to_string()
}

/// Snapshot the canonical model of every bundled example.
///
/// Compares against `tests/snapshots/<name>.json`. Set `UPDATE_SNAPSHOTS=1` to
/// rewrite them, then read the diff: that diff *is* the compatibility review.
#[test]
fn the_corpus_model_is_stable() {
    let root = repo_root();
    let snapshots = root.join("crates/thoughtml/tests/snapshots");
    let update = std::env::var("UPDATE_SNAPSHOTS").is_ok();
    if update {
        fs::create_dir_all(&snapshots).expect("create snapshot dir");
    }

    let mut examples: Vec<PathBuf> = fs::read_dir(root.join("examples"))
        .expect("examples dir")
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "thml"))
        .collect();
    examples.sort();
    assert_eq!(examples.len(), 10, "expected the ten-document corpus");

    let mut drifted = Vec::new();
    for path in &examples {
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        let source = fs::read_to_string(path).expect("read example");
        // The default reading only: derived numbers are explicitly *not* frozen
        // (STABILITY.md), so snapshotting them would pin what we chose not to pin.
        let result = thoughtml::parse_str(&source);
        let json = serde_json::to_string_pretty(&result.canonical).expect("serialize");
        let snap = snapshots.join(format!("{name}.json"));
        if update {
            fs::write(&snap, json + "\n").expect("write snapshot");
            continue;
        }
        match fs::read_to_string(&snap) {
            // Compare as text with line endings normalized. serde emits LF; a
            // Windows checkout can hand back CRLF, and a snapshot that differs only
            // in invisible bytes is not a model change.
            Ok(expected) if normalize(&expected) == normalize(&json) => {}
            Ok(_) => drifted.push(name),
            Err(_) => drifted.push(format!("{name} (no snapshot)")),
        }
    }
    assert!(
        drifted.is_empty(),
        "the canonical model changed for: {drifted:?}\n\
         If that was intended, run with UPDATE_SNAPSHOTS=1 and review the diff — \
         it is the compatibility review STABILITY.md asks for."
    );
}
