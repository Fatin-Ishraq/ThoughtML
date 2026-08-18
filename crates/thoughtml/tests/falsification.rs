//! Does the mirror actually work? A test built to make it fail.
//!
//! Three questions, deliberately separated, because answering only the first is
//! marketing:
//!
//! 1. **Detection.** Given a document with a known defect, does it fire?
//! 2. **Restraint.** Given a sound document, does it stay quiet? A checker that
//!    flags everything catches everything and is worthless.
//! 3. **Blind spots.** Which real reasoning errors does it *miss*? Those are
//!    asserted as misses, on purpose. If one ever starts being caught, this test
//!    fails and the claim the docs make gets widened deliberately, with a diff,
//!    rather than by hopeful drift.
//!
//! The third group is the honest half. ThoughtML checks a document against
//! *itself*; it has no access to the world. A false premise, a cherry-picked
//! trial, or one fact entered twice under two names are all internally coherent,
//! and all produce confident-looking numbers. Knowing exactly where the tool stops
//! is what makes the part that works trustworthy.

use thoughtml::canonical::Object;
use thoughtml::Options;

fn conflicts(src: &str) -> Vec<String> {
    let opts = Options {
        derive_confidence: true,
        argument_status: true,
        audit: true,
        ..Options::default()
    };
    thoughtml::parse_str_with(src, opts)
        .canonical
        .audit
        .as_ref()
        .map(|a| a.conflicts.iter().map(|c| c.kind.clone()).collect())
        .unwrap_or_default()
}

/// Every stable code the toolchain would report, validation plus the opt-in lints.
fn codes(src: &str) -> Vec<String> {
    let r = thoughtml::parse_str(src);
    let mut out: Vec<String> = r
        .diagnostics
        .items
        .iter()
        .filter_map(|d| thoughtml::lint::code_for(&d.message))
        .map(str::to_string)
        .collect();
    let canon = &r.canonical;
    let lints = thoughtml::lint::supports_as_list(canon);
    let loops = thoughtml::lint::circular_justification(canon);
    for d in lints.iter().chain(loops.iter()) {
        if let Some(c) = thoughtml::lint::code_for(&d.message) {
            out.push(c.to_string());
        }
    }
    out.sort();
    out.dedup();
    out
}

fn derived(src: &str, id: &str) -> Option<f64> {
    let opts = Options {
        derive_confidence: true,
        ..Options::default()
    };
    thoughtml::parse_str_with(src, opts)
        .canonical
        .objects
        .iter()
        .find_map(|o| match o {
            Object::Focus(f) if f.id == id => f.derived_confidence,
            _ => None,
        })
}

// --- 1. Detection ----------------------------------------------------------

#[test]
fn it_catches_confidence_that_contradicts_the_structure() {
    let src = "claim safe-to-ship\n  The migration is safe to run tonight.\n\nobservation backup-verified\n  Last night's backup restored cleanly.\n\nobservation dry-run-corrupted\n  The dry run corrupted three rows.\n\nlink backup-verified supports safe-to-ship\nlink dry-run-corrupted opposes safe-to-ship\n\nlead holds safe-to-ship\n  confidence 0.9 assumed\n";
    assert!(conflicts(src).contains(&"confidence-vs-status".to_string()));
}

#[test]
fn it_catches_one_id_meaning_two_things() {
    let src = "claim root-cause\n  The outage was caused by the config push.\n\nclaim root-cause\n  The outage was caused by a disk filling up.\n\nobservation outage\n  Down for 40 minutes.\n\nlink root-cause causes outage\n";
    assert!(conflicts(src).contains(&"definition-divergence".to_string()));
}

#[test]
fn it_catches_the_structural_mistakes() {
    let cases: &[(&str, &str, &str)] = &[
        (
            "circular causation",
            "claim a\n  A.\n\nclaim b\n  B.\n\nlink a causes b\nlink b causes a\n",
            "TML303",
        ),
        (
            "one agent both accepting and rejecting",
            "claim plan\n  Adopt it.\n\nobservation cost\n  Costs more.\n\nlink cost opposes plan\n\nboard accepts plan\nboard rejects plan\n",
            "TML302",
        ),
        (
            "a reference to nothing",
            "claim a\n  A claim.\n\nlink a supports nowhere\n",
            "TML201",
        ),
        (
            "a node earning no place",
            "claim a\n  A.\n\nobservation b\n  Seen.\n\nlink b supports a\n\nobservation floating\n  Unconnected.\n",
            "TML301",
        ),
        (
            "a revision predating what it revises",
            "claim old\n  First.\n  asserted-at 2026-05-01\n\nclaim new\n  Replacement.\n  asserted-at 2026-01-01\n\nlink new revises old\n",
            "TML304",
        ),
        (
            "an enumeration written as evidence",
            "claim strengths\n  Our strengths.\n\nobservation brand\n  Brand.\n\nobservation scale\n  Scale.\n\nobservation data\n  Data.\n\nobservation team\n  Team.\n\nsupports strengths\n  brand\n  scale\n  data\n  team\n",
            "TML501",
        ),
        (
            "justification that loops back on itself",
            "claim a-is-true\n  A, because B.\n\nclaim b-is-true\n  B, because A.\n\nlink a-is-true supports b-is-true\nlink b-is-true supports a-is-true\n",
            "TML502",
        ),
    ];
    for (label, src, code) in cases {
        let got = codes(src);
        assert!(
            got.iter().any(|c| c == code),
            "{label}: expected {code}, got {got:?}"
        );
    }
}

// --- 2. Restraint ----------------------------------------------------------

#[test]
fn it_stays_quiet_on_sound_documents() {
    // Appropriate uncertainty under attack is not a conflict.
    let measured = "claim ship-now\n  Ship this week.\n\nobservation tests-green\n  All tests pass.\n\nobservation perf-regression\n  p99 is up 12%.\n\nlink tests-green supports ship-now\nlink perf-regression opposes ship-now\n\ndev holds ship-now\n  confidence 0.4 estimated\n";
    assert!(conflicts(measured).is_empty(), "{:?}", conflicts(measured));
    assert!(codes(measured).is_empty(), "{:?}", codes(measured));

    // A list written as structure must not be mistaken for weak evidence.
    let listed = "claim strengths\n  Our strengths.\n\nobservation brand\n  Brand.\n\nobservation scale\n  Scale.\n\npart-of strengths\n  brand\n  scale\n\nclaim worth-investing\n  Worth investing.\n\nlink strengths supports worth-investing\n";
    assert!(conflicts(listed).is_empty(), "{:?}", conflicts(listed));
    assert!(codes(listed).is_empty(), "{:?}", codes(listed));
}

// --- 3. Blind spots, asserted as such ---------------------------------------

#[test]
fn a_false_premise_is_invisible() {
    // ThoughtML checks a document against itself, never against the world. The
    // reasoning here is valid and the premise is nonsense; nothing in the model
    // can know that.
    let src = "observation earth-is-flat\n  The earth is flat.\n\nclaim maps-are-wrong\n  Every world map is therefore wrong.\n\nlink earth-is-flat supports maps-are-wrong\n\ncartographer holds maps-are-wrong\n  confidence 0.95 measured\n";
    assert!(conflicts(src).is_empty(), "no conflict is expected here");
    assert!(codes(src).is_empty(), "{:?}", codes(src));
    assert!(
        derived(src, "maps-are-wrong").is_some_and(|c| c > 0.5),
        "and it derives real confidence from a false premise"
    );
}

#[test]
fn one_fact_entered_twice_counts_twice() {
    // Two ids, one underlying observation. Independence is assumed, never checked,
    // so the same evidence compounds.
    let doubled = "claim market-is-growing\n  The market is growing.\n\nobservation survey-says-growth\n  The Q1 survey reported growth.\n\nobservation press-release-cites-survey\n  The vendor's press release reported growth.\n\nlink survey-says-growth supports market-is-growing\n  weight 0.8\nlink press-release-cites-survey supports market-is-growing\n  weight 0.8\n";
    let single = "claim market-is-growing\n  The market is growing.\n\nobservation survey-says-growth\n  The Q1 survey reported growth.\n\nlink survey-says-growth supports market-is-growing\n  weight 0.8\n";
    assert!(codes(doubled).is_empty(), "{:?}", codes(doubled));
    let both = derived(doubled, "market-is-growing").expect("derived");
    let once = derived(single, "market-is-growing").expect("derived");
    assert!(
        both > once,
        "double-counting inflates belief ({both} vs {once}) and nothing says so"
    );
}

#[test]
fn evidence_never_written_down_cannot_be_missed() {
    // The sharpest limit. A document records what its author chose to record; the
    // two failed trials are absent, so the graph is perfectly coherent and wrong.
    let src = "claim treatment-works\n  The treatment works.\n\nobservation trial-three-positive\n  Trial 3 showed a positive effect.\n\nlink trial-three-positive supports treatment-works\n  weight 0.9 measured\n\nclinician holds treatment-works\n  confidence 0.9 measured\n";
    assert!(conflicts(src).is_empty());
    assert!(codes(src).is_empty(), "{:?}", codes(src));
    assert!(derived(src, "treatment-works").is_some_and(|c| c > 0.8));
}
