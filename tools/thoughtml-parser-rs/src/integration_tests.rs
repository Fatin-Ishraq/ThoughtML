//! End-to-end tests, primarily the §14 complete example.

use crate::canonical::Object;
use crate::lex::Value;
use crate::{parse_project, parse_str, parse_str_with, parse_str_with_overrides, Options, Overrides};

const COMPLETE_EXAMPLE: &str = "\
scope incident-742

team noticed metric-shift
  Activation metric increased after deployment.
  observed-at 2026-06-09T09:20+06:00

question cause-of-metric-shift
  What caused metric-shift?
  expects cause
  status open

team suspects deploy-change causes metric-shift as deploy-cause
  confidence 0.25..0.70
  answers cause-of-metric-shift

team holds rollback-decision
  Rollback the deployment.
  until cause-of-metric-shift answered
";

fn focus<'a>(objs: &'a [Object], id: &str) -> Option<&'a crate::canonical::Focus> {
    objs.iter().find_map(|o| match o {
        Object::Focus(f) if f.id == id => Some(f),
        _ => None,
    })
}

fn link<'a>(objs: &'a [Object], id: &str) -> Option<&'a crate::canonical::Link> {
    objs.iter().find_map(|o| match o {
        Object::Link(l) if l.id == id => Some(l),
        _ => None,
    })
}

fn stance<'a>(objs: &'a [Object], id: &str) -> Option<&'a crate::canonical::Stance> {
    objs.iter().find_map(|o| match o {
        Object::Stance(s) if s.id == id => Some(s),
        _ => None,
    })
}

#[test]
fn complete_example_is_clean() {
    let r = parse_str(COMPLETE_EXAMPLE);
    assert!(
        !r.diagnostics.has_errors(),
        "errors: {:?}",
        r.diagnostics.items
    );
    assert!(
        !r.diagnostics.has_warnings(),
        "warnings: {:?}",
        r.diagnostics.items
    );
}

/// Pins the exact canonical JSON wire shape (§9, §16). Field names, source
/// ordering, the lowercase `type` tag, typed field values (`{kind, value}`),
/// omitted-when-absent options, and number formatting (`0.70` serializes as
/// `0.7`) are all locked here. The always-on `timeline` (§10.2) appears; the
/// opt-in computational fields (§10.3–§10.6) only *add* keys — they never
/// reshape what is below. If you change serialization on purpose, re-run and
/// paste the new expected output.
#[test]
fn canonical_json_shape_is_pinned() {
    let r = parse_str(COMPLETE_EXAMPLE);
    let json = serde_json::to_string_pretty(&r.canonical).unwrap();
    let expected = r#"{
  "objects": [
    {
      "type": "scope",
      "id": "incident-742"
    },
    {
      "type": "focus",
      "id": "metric-shift",
      "kind": "observation",
      "body": "Activation metric increased after deployment."
    },
    {
      "type": "stance",
      "id": "team-noticed-metric-shift",
      "agent": "team",
      "posture": "noticed",
      "target": "metric-shift",
      "fields": {
        "observed-at": {
          "kind": "time",
          "value": "2026-06-09T09:20+06:00"
        }
      }
    },
    {
      "type": "question",
      "id": "cause-of-metric-shift",
      "body": "What caused metric-shift?",
      "expects": "cause",
      "status": "open"
    },
    {
      "type": "focus",
      "id": "deploy-change"
    },
    {
      "type": "link",
      "id": "deploy-cause",
      "from": "deploy-change",
      "relation": "causes",
      "to": "metric-shift"
    },
    {
      "type": "stance",
      "id": "team-suspects-deploy-cause",
      "agent": "team",
      "posture": "suspects",
      "target": "deploy-cause",
      "confidence": {
        "kind": "range",
        "value": [
          0.25,
          0.7
        ]
      },
      "fields": {
        "answers": {
          "kind": "ref",
          "value": "cause-of-metric-shift"
        }
      }
    },
    {
      "type": "focus",
      "id": "rollback-decision",
      "kind": "decision",
      "body": "Rollback the deployment."
    },
    {
      "type": "link",
      "id": "cause-of-metric-shift-blocks-rollback-decision",
      "from": "cause-of-metric-shift",
      "relation": "blocks",
      "to": "rollback-decision",
      "fields": {
        "status": {
          "kind": "symbol",
          "value": "answered"
        }
      }
    },
    {
      "type": "stance",
      "id": "team-holds-rollback-decision",
      "agent": "team",
      "posture": "holds",
      "target": "rollback-decision"
    }
  ],
  "timeline": {
    "start": "2026-06-09T09:20+06:00",
    "end": "2026-06-09T09:20+06:00"
  }
}"#;
    // Normalize line endings: serde_json always emits `\n`, but this source
    // file may be stored with `\r\n`, which would otherwise spuriously differ.
    let strip = |s: &str| s.replace('\r', "");
    assert_eq!(
        strip(&json),
        strip(expected),
        "canonical JSON shape changed:\n{json}"
    );
}

#[test]
fn complete_example_canonical_shape() {
    let r = parse_str(COMPLETE_EXAMPLE);
    let objs = &r.canonical.objects;

    // The §14 canonical shape: ten objects.
    assert_eq!(objs.len(), 10, "objects: {objs:#?}");

    // Scope.
    assert!(matches!(&objs[0], Object::Scope(s) if s.id == "incident-742"));

    // metric-shift is created once (dedup across noticed + suspects).
    let count = objs
        .iter()
        .filter(|o| matches!(o, Object::Focus(f) if f.id == "metric-shift"))
        .count();
    assert_eq!(count, 1, "metric-shift must not be duplicated");

    let ms = focus(objs, "metric-shift").unwrap();
    assert_eq!(
        ms.body.as_deref(),
        Some("Activation metric increased after deployment.")
    );
    assert!(focus(objs, "deploy-change").is_some());
    assert!(focus(objs, "rollback-decision").is_some());

    // Question.
    let q = objs
        .iter()
        .find_map(|o| match o {
            Object::Question(q) if q.id == "cause-of-metric-shift" => Some(q),
            _ => None,
        })
        .unwrap();
    assert_eq!(q.expects.as_deref(), Some("cause"));
    assert_eq!(q.status.as_deref(), Some("open"));
    assert!(q.body.as_deref().unwrap().contains("What caused"));

    // Aliased causal link.
    let dc = link(objs, "deploy-cause").unwrap();
    assert_eq!(dc.from, "deploy-change");
    assert_eq!(dc.relation, "causes");
    assert_eq!(dc.to, "metric-shift");

    // Stances.
    assert!(stance(objs, "team-noticed-metric-shift").is_some());
    let sus = stance(objs, "team-suspects-deploy-cause").unwrap();
    assert_eq!(sus.target, "deploy-cause");
    assert_eq!(sus.confidence, Some(Value::Range(0.25, 0.70)));
    assert!(stance(objs, "team-holds-rollback-decision").is_some());

    // until -> blocking link with preserved status.
    let blk = link(objs, "cause-of-metric-shift-blocks-rollback-decision").unwrap();
    assert_eq!(blk.from, "cause-of-metric-shift");
    assert_eq!(blk.relation, "blocks");
    assert_eq!(blk.to, "rollback-decision");
    assert_eq!(
        blk.fields.0.iter().find(|(k, _)| k == "status").map(|(_, v)| v),
        Some(&Value::Symbol("answered".to_string()))
    );
}

#[test]
fn infers_creates_supports_links() {
    // §8.3
    let src = "\
assistant infers user-values-standards from user-prefers-readable, user-cites-specs
  confidence 0.65";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    let objs = &r.canonical.objects;
    assert!(link(objs, "user-prefers-readable-supports-user-values-standards").is_some());
    assert!(link(objs, "user-cites-specs-supports-user-values-standards").is_some());
    let st = stance(objs, "assistant-infers-user-values-standards").unwrap();
    assert_eq!(st.confidence, Some(Value::Number(0.65)));
}

#[test]
fn doubts_makes_only_a_stance() {
    // §8.7 — no focus created.
    let src = "bob doubts deploy-cause\n  confidence 0.60";
    let r = parse_str(src);
    let objs = &r.canonical.objects;
    assert!(focus(objs, "deploy-cause").is_none());
    let st = stance(objs, "bob-doubts-deploy-cause").unwrap();
    assert_eq!(st.confidence, Some(Value::Number(0.60)));
}

#[test]
fn bad_confidence_range_is_error() {
    let r = parse_str("team suspects a causes b\n  confidence 0.9..0.1");
    assert!(r.diagnostics.has_errors());
}

#[test]
fn tabs_are_rejected() {
    let r = parse_str("focus x\n\tbody with tab");
    assert!(r.diagnostics.has_errors());
}

// --- Hardening: malformed input must never panic, hang, or lose data --------

/// A spread of malformed, partial, and hostile inputs. The harness turns any
/// panic into a test failure, so simply running these asserts robustness; we
/// also confirm the canonical model always serializes.
#[test]
fn malformed_inputs_never_panic() {
    let cases = [
        "",
        "   ",
        "\n\n\n",
        "# only a comment",
        ":",
        "::",
        "link",
        "link a",
        "link a b",
        "link a: b",
        "stance",
        "stance s:",
        "team",
        "team noticed",
        "team suspects",
        "team suspects a causes",
        "team suspects a causes b as",
        "team infers x",
        "team infers x from",
        "team infers x from ,",
        "focus",
        "focus A",
        "focus 日本語",
        "scope a b c",
        "question",
        "  indented before any header",
        "\t",
        "confidence 0.5",
        "team noticed metric\u{2028}shift",
        "focus x\n  confidence",
        "focus x\n  until",
        "ＦＯＣＵＳ x",
        "team suspects a causes b\n  confidence high",
        "team suspects a causes b\n  confidence 0.1..0.9..0.5",
        &"x".repeat(100_000),
        &format!("focus {}", "a-".repeat(10_000)),
    ];
    for (i, case) in cases.iter().enumerate() {
        let r = parse_str(case);
        // Always produces a (possibly empty) model that serializes.
        let json = serde_json::to_string(&r.canonical);
        assert!(json.is_ok(), "case {i} failed to serialize: {case:?}");
    }
}

#[test]
fn bom_is_stripped() {
    let r = parse_str("\u{feff}scope incident-742\nfocus metric-shift");
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    assert!(matches!(&r.canonical.objects[0], Object::Scope(s) if s.id == "incident-742"));
}

#[test]
fn crlf_line_endings() {
    let r = parse_str("scope x\r\nfocus y\r\n  Body text.\r\n");
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    assert_eq!(r.canonical.objects.len(), 2);
    assert_eq!(focus(&r.canonical.objects, "y").unwrap().body.as_deref(), Some("Body text."));
}

#[test]
fn duplicate_confidence_warns() {
    let r = parse_str("team suspects a causes b\n  confidence 0.2\n  confidence 0.8");
    assert!(r.diagnostics.has_warnings());
    // Last value wins.
    let st = r
        .canonical
        .objects
        .iter()
        .find_map(|o| match o {
            Object::Stance(s) if s.posture == "suspects" => Some(s),
            _ => None,
        })
        .unwrap();
    assert_eq!(st.confidence, Some(Value::Number(0.8)));
}

#[test]
fn id_collisions_terminate_and_suffix() {
    let src = "team suspects a causes b\n".repeat(5);
    let r = parse_str(&src);
    let link_ids: Vec<&str> = r
        .canonical
        .objects
        .iter()
        .filter_map(|o| match o {
            Object::Link(l) => Some(l.id.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(link_ids.len(), 5);
    assert!(link_ids.contains(&"a-causes-b"));
    assert!(link_ids.contains(&"a-causes-b-2"));
    assert!(link_ids.contains(&"a-causes-b-5"));
    // a and b are each created exactly once (dedup).
    assert_eq!(
        r.canonical
            .objects
            .iter()
            .filter(|o| matches!(o, Object::Focus(_)))
            .count(),
        2
    );
}

#[test]
fn large_input_is_linear_enough() {
    let mut src = String::new();
    for i in 0..3000 {
        src.push_str(&format!("focus f-{i}\n  body {i}\n"));
    }
    let r = parse_str(&src);
    assert!(!r.diagnostics.has_errors());
    assert_eq!(r.canonical.objects.len(), 3000);
}

#[test]
fn missing_target_reports_helpfully() {
    let r = parse_str("team noticed");
    assert!(r.diagnostics.has_errors());
    assert!(r
        .diagnostics
        .items
        .iter()
        .any(|d| d.message.contains("target")));
}

// --- Tier-1: richer nodes + semantic lints ---------------------------------

#[test]
fn explicit_link_carries_body() {
    let src = "\
focus a
focus b
link a causes b
  The deploy flipped a feature flag that drives the metric.";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    let l = link(&r.canonical.objects, "a-causes-b").unwrap();
    assert_eq!(
        l.body.as_deref(),
        Some("The deploy flipped a feature flag that drives the metric.")
    );
}

#[test]
fn note_field_rides_on_focus_creating_stance() {
    // `holds` creates a focus from its body, but a `note` must still land on
    // the stance so the rationale is visible on the stance node.
    let src = "\
team holds rollback-decision
  Roll the deployment back.
  note Cannot wait for the full RCA; revenue is bleeding.";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    let objs = &r.canonical.objects;
    // Body annotates the focus...
    assert_eq!(
        focus(objs, "rollback-decision").unwrap().body.as_deref(),
        Some("Roll the deployment back.")
    );
    // ...and the note annotates the stance.
    let st = stance(objs, "team-holds-rollback-decision").unwrap();
    let note = st.fields.0.iter().find(|(k, _)| k == "note");
    assert!(matches!(note, Some((_, Value::Text(t))) if t.contains("revenue is bleeding")));
}

#[test]
fn contradictory_stances_warn() {
    let r = parse_str("alice accepts plan-a\nalice rejects plan-a");
    assert!(r
        .diagnostics
        .items
        .iter()
        .any(|d| d.message.contains("contradictory")));
}

#[test]
fn non_contradictory_stances_are_quiet() {
    // Same postures on different targets, and different agents, never conflict.
    let r = parse_str("alice accepts plan-a\nbob rejects plan-a\nalice accepts plan-b");
    assert!(!r
        .diagnostics
        .items
        .iter()
        .any(|d| d.message.contains("contradictory")));
}

#[test]
fn causal_cycle_warns() {
    let src = "\
focus a
focus b
link a causes b
link b causes a";
    let r = parse_str(src);
    assert!(r
        .diagnostics
        .items
        .iter()
        .any(|d| d.message.contains("cyclic")));
}

#[test]
fn acyclic_chain_is_quiet() {
    let src = "\
focus a
focus b
focus c
link a causes b
link b causes c";
    let r = parse_str(src);
    assert!(!r
        .diagnostics
        .items
        .iter()
        .any(|d| d.message.contains("cyclic")));
}

#[test]
fn orphan_focus_warns_but_connected_does_not() {
    let src = "\
focus lonely
focus a
focus b
link a causes b";
    let r = parse_str(src);
    let orphans: Vec<&str> = r
        .diagnostics
        .items
        .iter()
        .filter(|d| d.message.contains("not connected"))
        .map(|d| d.message.as_str())
        .collect();
    assert_eq!(orphans.len(), 1, "got: {orphans:?}");
    assert!(orphans[0].contains("lonely"));
}

// --- Phase 1 (v0.2): typed foci, asks_about, Act provenance ----------------

fn focus_kind<'a>(objs: &'a [Object], id: &str) -> Option<&'a str> {
    focus(objs, id).and_then(|f| f.kind.as_deref())
}

#[test]
fn posture_infers_focus_kind() {
    let src = "\
team noticed metric-shift
team considers rollback-plan
team holds rollback-decision
team remembers prior-incident
assistant infers root-cause from metric-shift";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    let o = &r.canonical.objects;
    assert_eq!(focus_kind(o, "metric-shift"), Some("observation"));
    assert_eq!(focus_kind(o, "rollback-plan"), Some("option"));
    assert_eq!(focus_kind(o, "rollback-decision"), Some("decision"));
    assert_eq!(focus_kind(o, "prior-incident"), Some("memory"));
    assert_eq!(focus_kind(o, "root-cause"), Some("claim"));
}

#[test]
fn explicit_kind_beats_inferred_silently() {
    // An explicit kind is authoritative; a later posture-inferred kind does not
    // override it and does not warn.
    let src = "\
focus risk-appetite
  kind assumption
team noticed risk-appetite";
    let r = parse_str(src);
    assert_eq!(focus_kind(&r.canonical.objects, "risk-appetite"), Some("assumption"));
    assert!(!r.diagnostics.items.iter().any(|d| d.message.contains("redeclared")));
}

#[test]
fn inferred_kind_refines_silently() {
    // considers → option, then chooses → decision: a natural promotion, no warn.
    let src = "team considers plan-a\nteam chooses plan-a";
    let r = parse_str(src);
    assert_eq!(focus_kind(&r.canonical.objects, "plan-a"), Some("decision"));
    assert!(!r.diagnostics.items.iter().any(|d| d.message.contains("redeclared")));
}

#[test]
fn conflicting_explicit_kinds_warn() {
    let src = "\
focus x
  kind observation
focus x
  kind decision";
    let r = parse_str(src);
    // First explicit declaration wins.
    assert_eq!(focus_kind(&r.canonical.objects, "x"), Some("observation"));
    assert!(r
        .diagnostics
        .items
        .iter()
        .any(|d| d.message.contains("redeclared as `decision`")));
}

#[test]
fn unknown_kind_warns_but_is_kept() {
    let r = parse_str("focus x\n  kind wishful-thinking");
    assert_eq!(focus_kind(&r.canonical.objects, "x"), Some("wishful-thinking"));
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("unknown focus kind")));
}

#[test]
fn about_field_populates_asks_about() {
    let src = "\
focus a
focus b
question q
  What links a and b?
  about a, b";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    let q = r.canonical.objects.iter().find_map(|o| match o {
        Object::Question(q) if q.id == "q" => Some(q),
        _ => None,
    }).unwrap();
    assert_eq!(q.asks_about, vec!["a".to_string(), "b".to_string()]);
}

#[test]
fn about_unresolved_warns() {
    let r = parse_str("question q\n  What about it?\n  about ghost");
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("about unresolved reference")));
}

#[test]
fn acts_are_opt_in() {
    let src = "team noticed metric-shift\n  Activation rose.";
    let off = parse_str(src);
    assert!(!off.canonical.objects.iter().any(|o| matches!(o, Object::Act(_))));

    let on = parse_str_with(src, Options { emit_acts: true, ..Options::default() });
    let act = on.canonical.objects.iter().find_map(|o| match o {
        Object::Act(a) => Some(a),
        _ => None,
    }).expect("an Act should be emitted");
    assert_eq!(act.verb, "noticed");
    assert_eq!(act.agent.as_deref(), Some("team"));
    // expands_to records the focus + stance the action produced.
    assert!(act.expands_to.contains(&"metric-shift".to_string()));
    assert!(act.expands_to.contains(&"team-noticed-metric-shift".to_string()));
}

#[test]
fn focus_referenced_only_by_a_field_is_not_orphan() {
    // `because` points at evidence; that counts as a connection.
    let src = "\
focus evidence
focus a
focus b
link a causes b
  because evidence";
    let r = parse_str(src);
    assert!(!r
        .diagnostics
        .items
        .iter()
        .any(|d| d.message.contains("evidence") && d.message.contains("not connected")));
}

// --- Phase 2 (v0.2): graded relations / evidence weight --------------------

#[test]
fn adverb_sets_link_weight() {
    let src = "focus a\nfocus b\nlink a strongly supports b";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    assert_eq!(link(&r.canonical.objects, "a-supports-b").unwrap().weight, Some(0.85));
}

#[test]
fn weight_field_overrides_adverb() {
    let src = "focus a\nfocus b\nlink a weakly supports b\n  weight 0.5";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    let l = link(&r.canonical.objects, "a-supports-b").unwrap();
    assert_eq!(l.weight, Some(0.5));
    // `weight` is promoted off the field map onto the link.
    assert!(l.fields.0.iter().all(|(k, _)| k != "weight"));
}

#[test]
fn suspects_and_infers_carry_weight() {
    let r1 = parse_str("team suspects a causes b\n  weight 0.4");
    let lk = r1.canonical.objects.iter().find_map(|o| match o {
        Object::Link(l) => Some(l),
        _ => None,
    }).unwrap();
    assert_eq!(lk.weight, Some(0.4));

    let r2 = parse_str("assistant infers c from d, e\n  weight 0.7");
    let weights: Vec<Option<f64>> = r2.canonical.objects.iter().filter_map(|o| match o {
        Object::Link(l) => Some(l.weight),
        _ => None,
    }).collect();
    assert_eq!(weights, vec![Some(0.7), Some(0.7)]);
}

#[test]
fn weight_out_of_range_warns_and_clamps() {
    let r = parse_str("focus a\nfocus b\nlink a supports b\n  weight 1.4");
    assert_eq!(link(&r.canonical.objects, "a-supports-b").unwrap().weight, Some(1.0));
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("weight should be in 0..1")));
}

#[test]
fn non_numeric_weight_errors() {
    let r = parse_str("focus a\nfocus b\nlink a supports b\n  weight high");
    assert!(r.diagnostics.has_errors());
}

// --- Phase 3 (v0.2): temporal & revision model -----------------------------

fn superseded_by<'a>(objs: &'a [Object], id: &str) -> Option<&'a str> {
    objs.iter().find_map(|o| match o {
        Object::Focus(f) if f.id == id => f.superseded_by.as_deref(),
        Object::Stance(s) if s.id == id => s.superseded_by.as_deref(),
        Object::Link(l) if l.id == id => l.superseded_by.as_deref(),
        _ => None,
    })
}

#[test]
fn revises_relation_supersedes_node() {
    // `new revises old` marks the old belief superseded; both are kept.
    let src = "\
focus old-plan
focus new-plan
link new-plan revises old-plan";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    let objs = &r.canonical.objects;
    assert_eq!(superseded_by(objs, "old-plan"), Some("new-plan"));
    // Both nodes survive — a revision is a new belief, not a mutation.
    assert!(focus(objs, "old-plan").is_some());
    assert!(focus(objs, "new-plan").is_some());
    // The newer belief is not itself superseded.
    assert_eq!(superseded_by(objs, "new-plan"), None);
}

#[test]
fn revises_posture_supersedes_prior_stance() {
    let src = "\
analyst suspects a causes b as claim
  confidence 0.6
analyst revises claim
  confidence 0.3";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_errors(), "{:?}", r.diagnostics.items);
    let objs = &r.canonical.objects;
    assert_eq!(
        superseded_by(objs, "analyst-suspects-claim"),
        Some("analyst-revises-claim")
    );
    assert_eq!(superseded_by(objs, "analyst-revises-claim"), None);
}

#[test]
fn revision_chain_supersedes_each_prior() {
    // Each revision supersedes only the immediately preceding belief.
    let src = "\
analyst suspects a causes b as claim
analyst revises claim
  confidence 0.4
analyst revises claim
  confidence 0.2";
    let r = parse_str(src);
    let objs = &r.canonical.objects;
    assert_eq!(
        superseded_by(objs, "analyst-suspects-claim"),
        Some("analyst-revises-claim")
    );
    assert_eq!(
        superseded_by(objs, "analyst-revises-claim"),
        Some("analyst-revises-claim-2")
    );
    assert_eq!(superseded_by(objs, "analyst-revises-claim-2"), None);
}

#[test]
fn timeline_spans_min_to_max() {
    let src = "\
team noticed early
  observed-at 2026-06-01
team noticed late
  observed-at 2026-06-15
team noticed middle
  observed-at 2026-06-09T09:20+06:00";
    let r = parse_str(src);
    let tl = r.canonical.timeline.expect("a timeline should be derived");
    assert_eq!(tl.start, "2026-06-01");
    assert_eq!(tl.end, "2026-06-15");
}

#[test]
fn no_timestamps_means_no_timeline() {
    let r = parse_str("focus a\nfocus b\nlink a causes b");
    assert!(r.canonical.timeline.is_none());
}

#[test]
fn revision_asserted_before_target_warns() {
    let src = "\
focus old
  asserted-at 2026-06-10
focus new
  asserted-at 2026-06-01
link new revises old
  asserted-at 2026-06-01";
    let r = parse_str(src);
    assert!(r
        .diagnostics
        .items
        .iter()
        .any(|d| d.message.contains("asserted earlier")));
}

#[test]
fn inverted_valid_during_warns() {
    let r = parse_str("focus x\n  valid-during 2026-12-31..2026-01-01");
    assert!(r
        .diagnostics
        .items
        .iter()
        .any(|d| d.message.contains("ends before it starts")));
}

// --- Phase 4 (v0.2): derived confidence (evidence propagation) -------------

fn parse_derived(src: &str) -> crate::ParseResult {
    parse_str_with(
        src,
        Options {
            derive_confidence: true,
            ..Options::default()
        },
    )
}

fn derived_of(objs: &[Object], id: &str) -> Option<f64> {
    objs.iter().find_map(|o| match o {
        Object::Focus(f) if f.id == id => f.derived_confidence,
        Object::Link(l) if l.id == id => l.derived_confidence,
        _ => None,
    })
}

fn approx(a: f64, b: f64) {
    assert!((a - b).abs() < 1e-6, "expected {b}, got {a}");
}

#[test]
fn single_support_derives_confidence() {
    // logistic(GAIN * polarity*weight*believedness) = logistic(2*1*0.5*1) = 0.731.
    let src = "focus evidence\nfocus claim\nlink evidence supports claim";
    let r = parse_derived(src);
    approx(derived_of(&r.canonical.objects, "claim").unwrap(), 0.731);
    // A pure source gets no derived confidence.
    assert_eq!(derived_of(&r.canonical.objects, "evidence"), None);
}

#[test]
fn opposing_evidence_cancels() {
    let src = "\
focus a
focus b
focus claim
link a supports claim
  weight 0.6
link b undercuts claim
  weight 0.6";
    let r = parse_derived(src);
    approx(derived_of(&r.canonical.objects, "claim").unwrap(), 0.5);
}

#[test]
fn weight_scales_derived_confidence() {
    let strong = parse_derived("focus a\nfocus c\nlink a strongly supports c");
    approx(derived_of(&strong.canonical.objects, "c").unwrap(), 0.846); // logistic(1.7)
    let weak = parse_derived("focus a\nfocus c\nlink a weakly supports c");
    // logistic(2*0.30) = 0.646; weaker evidence → lower confidence.
    approx(derived_of(&weak.canonical.objects, "c").unwrap(), 0.646);
}

#[test]
fn confidence_propagates_transitively() {
    // base undercuts mid; mid supports top. `top` must see mid's *derived*
    // strength (0.269), not a default of 1.0.
    let src = "\
focus base
focus mid
focus top
link base undercuts mid
link mid supports top";
    let r = parse_derived(src);
    let o = &r.canonical.objects;
    approx(derived_of(o, "mid").unwrap(), 0.269); // logistic(-1.0)
    approx(derived_of(o, "top").unwrap(), 0.567); // logistic(2*0.5*0.268941)
}

#[test]
fn authored_source_confidence_feeds_in() {
    // `hyp` is believed at 0.5 (authored); it backs `downstream` at that strength.
    let src = "\
team suspects cause causes effect as hyp
  confidence 0.5
focus downstream
link hyp supports downstream";
    let r = parse_derived(src);
    approx(derived_of(&r.canonical.objects, "downstream").unwrap(), 0.622); // logistic(0.5)
}

#[test]
fn superseded_belief_does_not_propagate() {
    // Phase 3 × 4: the revised-away 0.9 is ignored; the current 0.2 propagates.
    let src = "\
team suspects p causes h as hyp
  confidence 0.9
team revises hyp
  confidence 0.2
focus d
link hyp supports d";
    let r = parse_derived(src);
    approx(derived_of(&r.canonical.objects, "d").unwrap(), 0.550); // logistic(0.2)
}

#[test]
fn derived_confidence_is_bounded_and_opt_in() {
    let src = "\
focus a
focus b
focus claim
link a strongly supports claim
link b strongly supports claim";
    // Bounded in (0,1) no matter how much evidence piles up.
    let on = parse_derived(src);
    let d = derived_of(&on.canonical.objects, "claim").unwrap();
    assert!(d > 0.9 && d < 1.0, "expected high-but-bounded, got {d}");
    // Opt-in: the default pipeline emits nothing.
    let off = parse_str(src);
    assert_eq!(derived_of(&off.canonical.objects, "claim"), None);
}

// --- Phase 5 (v0.2): grounded argument status ------------------------------

fn parse_status(src: &str) -> crate::ParseResult {
    parse_str_with(
        src,
        Options {
            argument_status: true,
            ..Options::default()
        },
    )
}

fn status_of<'a>(objs: &'a [Object], id: &str) -> Option<&'a str> {
    objs.iter().find_map(|o| match o {
        Object::Focus(f) if f.id == id => f.argument_status.as_deref(),
        Object::Link(l) if l.id == id => l.argument_status.as_deref(),
        _ => None,
    })
}

#[test]
fn unattacked_is_accepted_attacked_is_defeated() {
    let src = "focus a\nfocus b\nlink a undercuts b";
    let r = parse_status(src);
    let o = &r.canonical.objects;
    assert_eq!(status_of(o, "a"), Some("in")); // nothing attacks a
    assert_eq!(status_of(o, "b"), Some("out")); // a (accepted) attacks b
}

#[test]
fn a_defended_argument_survives() {
    // c attacks a, a attacks b: a falls, so b stands.
    let src = "\
focus a
focus b
focus c
link a undercuts b
link c undercuts a";
    let r = parse_status(src);
    let o = &r.canonical.objects;
    assert_eq!(status_of(o, "c"), Some("in"));
    assert_eq!(status_of(o, "a"), Some("out"));
    assert_eq!(status_of(o, "b"), Some("in"));
}

#[test]
fn mutual_attack_is_undecided() {
    let src = "focus a\nfocus b\nlink a opposes b\nlink b opposes a";
    let r = parse_status(src);
    let o = &r.canonical.objects;
    assert_eq!(status_of(o, "a"), Some("undecided"));
    assert_eq!(status_of(o, "b"), Some("undecided"));
}

#[test]
fn support_is_not_an_attack() {
    // A pure support graph has no contested nodes, so no statuses are assigned.
    let r = parse_status("focus a\nfocus b\nlink a supports b");
    let o = &r.canonical.objects;
    assert_eq!(status_of(o, "a"), None);
    assert_eq!(status_of(o, "b"), None);
}

#[test]
fn argument_status_is_opt_in() {
    let src = "focus a\nfocus b\nlink a undercuts b";
    let off = parse_str(src);
    assert_eq!(status_of(&off.canonical.objects, "b"), None);
    let on = parse_status(src);
    assert_eq!(status_of(&on.canonical.objects, "b"), Some("out"));
}

// --- Phase 6 (v0.2): sensitivity (leverage) & what-if ----------------------

fn parse_sensitivity(src: &str) -> crate::ParseResult {
    parse_str_with(
        src,
        Options {
            derive_confidence: true,
            sensitivity: true,
            ..Options::default()
        },
    )
}

fn parse_overrides(src: &str, links: &[&str], nodes: &[&str]) -> crate::ParseResult {
    let overrides = Overrides {
        disabled_links: links.iter().map(|s| s.to_string()).collect(),
        disabled_nodes: nodes.iter().map(|s| s.to_string()).collect(),
    };
    parse_str_with_overrides(
        src,
        Options {
            derive_confidence: true,
            argument_status: true,
            sensitivity: true,
            ..Options::default()
        },
        &overrides,
    )
}

fn leverage_of(objs: &[Object], id: &str) -> Option<f64> {
    objs.iter().find_map(|o| match o {
        Object::Link(l) if l.id == id => l.leverage,
        _ => None,
    })
}

#[test]
fn sole_support_leverage_lifts_from_neutral() {
    // One support takes the claim from neutral (0.5) to 0.731, so its leverage is
    // the full 0.231 — the claim rests entirely on this one edge.
    let src = "focus evidence\nfocus claim\nlink evidence supports claim";
    let r = parse_sensitivity(src);
    let o = &r.canonical.objects;
    approx(derived_of(o, "claim").unwrap(), 0.731);
    approx(leverage_of(o, "evidence-supports-claim").unwrap(), 0.231);
}

#[test]
fn support_pulls_up_attack_pulls_down() {
    // Balanced support and undercut: removing the support drops the claim
    // (positive leverage); removing the undercut raises it (negative leverage).
    let src = "\
focus a
focus b
focus claim
link a supports claim
  weight 0.6
link b undercuts claim
  weight 0.6";
    let r = parse_sensitivity(src);
    let o = &r.canonical.objects;
    approx(derived_of(o, "claim").unwrap(), 0.5);
    approx(leverage_of(o, "a-supports-claim").unwrap(), 0.269);
    approx(leverage_of(o, "b-undercuts-claim").unwrap(), -0.269);
}

#[test]
fn redundant_evidence_is_less_load_bearing() {
    // A claim held up by two strong supports leans on each less than a claim held
    // up by a single one — redundancy lowers per-edge leverage.
    let src = "\
focus s1
focus s2
focus shared
link s1 strongly supports shared
link s2 strongly supports shared
focus s3
focus sole
link s3 strongly supports sole";
    let r = parse_sensitivity(src);
    let o = &r.canonical.objects;
    let redundant = leverage_of(o, "s1-supports-shared").unwrap();
    let sole = leverage_of(o, "s3-supports-sole").unwrap();
    assert!(
        sole > redundant,
        "sole support ({sole}) should out-weigh a redundant one ({redundant})"
    );
}

#[test]
fn sensitivity_is_opt_in() {
    let src = "focus e\nfocus c\nlink e supports c";
    assert_eq!(leverage_of(&parse_str(src).canonical.objects, "e-supports-c"), None);
    // Even with derived confidence on, leverage stays off until asked for.
    assert_eq!(leverage_of(&parse_derived(src).canonical.objects, "e-supports-c"), None);
    assert!(leverage_of(&parse_sensitivity(src).canonical.objects, "e-supports-c").is_some());
}

#[test]
fn whatif_disabling_a_link_recomputes_confidence() {
    // Support and undercut cancel at 0.5; muting the undercut lets the support win.
    let src = "\
focus a
focus b
focus claim
link a supports claim
link b undercuts claim";
    let base = parse_overrides(src, &[], &[]);
    approx(derived_of(&base.canonical.objects, "claim").unwrap(), 0.5);
    let muted = parse_overrides(src, &["b-undercuts-claim"], &[]);
    approx(derived_of(&muted.canonical.objects, "claim").unwrap(), 0.731);
}

#[test]
fn whatif_disabling_a_node_drops_its_edges() {
    // Muting node `b` removes the undercut that runs through it — same effect.
    let src = "\
focus a
focus b
focus claim
link a supports claim
link b undercuts claim";
    let muted = parse_overrides(src, &[], &["b"]);
    approx(derived_of(&muted.canonical.objects, "claim").unwrap(), 0.731);
}

#[test]
fn whatif_perturbs_argument_status_too() {
    // Removing the sole attack leaves the target uncontested — no status at all.
    let src = "focus a\nfocus b\nlink a undercuts b";
    let base = parse_overrides(src, &[], &[]);
    assert_eq!(status_of(&base.canonical.objects, "b"), Some("out"));
    let muted = parse_overrides(src, &["a-undercuts-b"], &[]);
    assert_eq!(status_of(&muted.canonical.objects, "b"), None);
}

// --- Phase 7 (v0.2): quantities & units ------------------------------------

fn quantity_of<'a>(objs: &'a [Object], id: &str) -> Option<&'a crate::canonical::Quantity> {
    focus(objs, id).and_then(|f| f.quantity.as_ref())
}

fn no_quantity_warning(r: &crate::ParseResult) -> bool {
    !r.diagnostics.items.iter().any(|d| d.message.contains("quantity"))
}

#[test]
fn quantity_classifies_time_and_normalizes() {
    let r = parse_str("focus latency\n  quantity 200 ms");
    let q = quantity_of(&r.canonical.objects, "latency").unwrap();
    assert_eq!(q.value, 200.0);
    assert_eq!(q.unit, "ms");
    assert_eq!(q.dimension, "time");
    assert_eq!(q.normalized, Some(0.2));
    assert_eq!(q.base_unit.as_deref(), Some("s"));
    assert!(no_quantity_warning(&r));
}

#[test]
fn quantity_currency_is_distinct_per_currency() {
    // No FX rates in v0.2, so currencies don't normalize and never mix.
    let r = parse_str("focus cost\n  quantity 1200 USD");
    let q = quantity_of(&r.canonical.objects, "cost").unwrap();
    assert_eq!(q.dimension, "currency:USD");
    assert_eq!(q.normalized, None);
    assert_eq!(q.base_unit, None);
}

#[test]
fn quantity_count_and_rate_are_opaque() {
    let r = parse_str("focus load\n  quantity 4500 req/s\nfocus team-size\n  quantity 12 people");
    let o = &r.canonical.objects;
    assert_eq!(quantity_of(o, "load").unwrap().dimension, "rate");
    assert_eq!(quantity_of(o, "team-size").unwrap().dimension, "count:people");
}

#[test]
fn fused_quantity_token_parses() {
    let r = parse_str("focus x\n  quantity 1.5GB");
    let q = quantity_of(&r.canonical.objects, "x").unwrap();
    assert_eq!(q.value, 1.5);
    assert_eq!(q.unit, "GB");
    assert_eq!(q.dimension, "information");
    assert_eq!(q.normalized, Some(1_500_000_000.0));
    assert!(no_quantity_warning(&r));
}

#[test]
fn percent_quantity_normalizes_to_fraction() {
    let r = parse_str("focus headroom\n  quantity 30 %");
    let q = quantity_of(&r.canonical.objects, "headroom").unwrap();
    assert_eq!(q.dimension, "ratio");
    assert_eq!(q.normalized, Some(0.3));
}

#[test]
fn quantity_is_promoted_off_the_field_map() {
    // Like `weight`/`kind`, the typed quantity does not linger as a raw field.
    let r = parse_str("focus x\n  quantity 5 GB");
    let f = focus(&r.canonical.objects, "x").unwrap();
    assert!(f.quantity.is_some());
    assert!(f.fields.0.iter().all(|(k, _)| k != "quantity"));
}

#[test]
fn malformed_quantity_warns_and_is_dropped() {
    // No unit, and too many tokens — both warn, neither yields a quantity.
    let r1 = parse_str("focus x\n  quantity 200");
    assert!(quantity_of(&r1.canonical.objects, "x").is_none());
    assert!(r1.diagnostics.items.iter().any(|d| d.message.contains("quantity")));
    let r2 = parse_str("focus y\n  quantity 200 ms extra");
    assert!(quantity_of(&r2.canonical.objects, "y").is_none());
    assert!(r2.diagnostics.has_warnings());
}

#[test]
fn quantity_merges_onto_posture_introduced_focus() {
    // `noticed` creates the focus; a later `focus` record supplies its measure.
    let src = "team noticed disk-usage\nfocus disk-usage\n  quantity 512 GB";
    let r = parse_str(src);
    let q = quantity_of(&r.canonical.objects, "disk-usage").unwrap();
    assert_eq!(q.unit, "GB");
    assert_eq!(
        r.canonical.objects.iter().filter(|o| matches!(o, Object::Focus(f) if f.id == "disk-usage")).count(),
        1,
        "focus must be deduped, carrying the merged quantity"
    );
}

// --- Phase 8 (v0.2): formulas (executable documents) -----------------------

fn parse_formulas(src: &str) -> crate::ParseResult {
    parse_str_with(
        src,
        Options {
            formulas: true,
            ..Options::default()
        },
    )
}

fn computed_of<'a>(objs: &'a [Object], id: &str) -> Option<&'a crate::canonical::Quantity> {
    focus(objs, id).and_then(|f| f.computed_quantity.as_ref())
}

#[test]
fn formula_sums_quantities() {
    let src = "\
focus hosting
  quantity 1200 USD
focus bandwidth
  quantity 300 USD
focus total
  = hosting + bandwidth";
    let r = parse_formulas(src);
    let q = computed_of(&r.canonical.objects, "total").unwrap();
    assert_eq!(q.value, 1500.0);
    assert_eq!(q.unit, "USD");
    assert_eq!(q.dimension, "currency:USD");
    // Formula refs are connections, so no orphan warnings fire.
    assert!(!r.diagnostics.has_warnings(), "{:?}", r.diagnostics.items);
}

#[test]
fn formula_multiplication_cancels_units() {
    // USD/instance × instance → USD.
    let src = "\
focus rate
  quantity 180 USD/instance
focus n
  quantity 12 instance
focus cost
  = rate * n";
    let r = parse_formulas(src);
    let q = computed_of(&r.canonical.objects, "cost").unwrap();
    assert_eq!(q.value, 2160.0);
    assert_eq!(q.unit, "USD");
    assert_eq!(q.dimension, "currency:USD");
}

#[test]
fn formula_ratio_is_dimensionless() {
    let src = "\
focus revenue
  quantity 50000 USD
focus cost
  quantity 2240 USD
focus margin
  = (revenue - cost) / revenue";
    let r = parse_formulas(src);
    let q = computed_of(&r.canonical.objects, "margin").unwrap();
    assert_eq!(q.value, 0.955);
    assert_eq!(q.unit, "");
    assert_eq!(q.dimension, "dimensionless");
}

#[test]
fn formula_dimension_mismatch_warns() {
    let src = "\
focus a
  quantity 1 USD
focus b
  quantity 1 ms
focus bad
  = a + b";
    let r = parse_formulas(src);
    assert!(computed_of(&r.canonical.objects, "bad").is_none());
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("different dimensions")));
}

#[test]
fn formula_chains_transitively() {
    // `total` depends on the formula `sub`, so it must evaluate after it.
    let src = "\
focus a
  quantity 2 USD
focus b
  quantity 3 USD
focus sub
  = a + b
focus c
  quantity 5 USD
focus total
  = sub + c";
    let o = &parse_formulas(src).canonical.objects;
    assert_eq!(computed_of(o, "sub").unwrap().value, 5.0);
    assert_eq!(computed_of(o, "total").unwrap().value, 10.0);
}

#[test]
fn formula_cycle_warns_and_skips() {
    let src = "\
focus a
  = b + 1
focus b
  = a + 1";
    let r = parse_formulas(src);
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("cycle")));
    assert!(computed_of(&r.canonical.objects, "a").is_none());
    assert!(computed_of(&r.canonical.objects, "b").is_none());
}

#[test]
fn formula_unknown_reference_warns() {
    let r = parse_formulas("focus t\n  = ghost + 1");
    assert!(computed_of(&r.canonical.objects, "t").is_none());
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("ghost")));
}

#[test]
fn formula_is_opt_in_but_authored_text_is_always_kept() {
    let src = "focus a\n  quantity 1 USD\nfocus t\n  = a + a";
    let off = parse_str(src);
    let f = focus(&off.canonical.objects, "t").unwrap();
    assert_eq!(f.formula.as_deref(), Some("a + a")); // authored — always present
    assert!(f.computed_quantity.is_none()); // computation is opt-in
    assert!(computed_of(&parse_formulas(src).canonical.objects, "t").is_some());
}

#[test]
fn formula_references_count_as_connections() {
    // Even with formulas off, a formula ref keeps its inputs from being orphans,
    // and a formula focus is itself connected.
    let r = parse_str("focus a\n  quantity 1 USD\nfocus b\n  = a + 1");
    assert!(!r.diagnostics.items.iter().any(|d| d.message.contains("not connected")));
}

#[test]
fn cost_model_example_evaluates_clean() {
    let r = parse_formulas(include_str!("../examples/cost-model.thml"));
    assert!(!r.diagnostics.has_warnings(), "{:?}", r.diagnostics.items);
    let o = &r.canonical.objects;
    assert_eq!(computed_of(o, "monthly-compute").unwrap().value, 2160.0);
    assert_eq!(computed_of(o, "monthly-storage").unwrap().value, 80.0);
    assert_eq!(computed_of(o, "monthly-total").unwrap().value, 2240.0);
    let margin = computed_of(o, "gross-margin").unwrap();
    assert_eq!(margin.value, 0.955);
    assert_eq!(margin.dimension, "dimensionless");
}

// --- Phase 9 (v0.2): decision expected value -------------------------------

/// Enable the whole computational track at once, so EV can draw on formula
/// payoffs (§4.8) and derived-confidence probabilities (§10.3).
fn parse_decisions(src: &str) -> crate::ParseResult {
    parse_str_with(
        src,
        Options {
            derive_confidence: true,
            formulas: true,
            decision_ev: true,
            ..Options::default()
        },
    )
}

fn expected_value_of<'a>(objs: &'a [Object], id: &str) -> Option<&'a crate::canonical::ExpectedValue> {
    focus(objs, id).and_then(|f| f.expected_value.as_ref())
}

fn decision_of<'a>(objs: &'a [Object], id: &str) -> Option<&'a crate::canonical::DecisionEV> {
    focus(objs, id).and_then(|f| f.decision.as_ref())
}

/// Like `parse_decisions`, but with a what-if perturbation, so muting recomputes
/// the whole computational stack (Phase 9 polish).
fn parse_compute_overrides(src: &str, links: &[&str], nodes: &[&str]) -> crate::ParseResult {
    let overrides = Overrides {
        disabled_links: links.iter().map(|s| s.to_string()).collect(),
        disabled_nodes: nodes.iter().map(|s| s.to_string()).collect(),
    };
    parse_str_with_overrides(
        src,
        Options {
            derive_confidence: true,
            formulas: true,
            decision_ev: true,
            ..Options::default()
        },
        &overrides,
    )
}

#[test]
fn expected_value_is_probability_weighted_sum() {
    // EV(bet) = 0.5·1000 + 0.5·(−500) = 250 USD.
    let src = "\
focus win
  quantity 1000 USD
focus lose
  quantity -500 USD
focus bet
  kind option
link bet leads-to win
  probability 0.5
link bet leads-to lose
  probability 0.5";
    let r = parse_decisions(src);
    let ev = expected_value_of(&r.canonical.objects, "bet").unwrap();
    assert_eq!(ev.value, 250.0);
    assert_eq!(ev.unit, "USD");
    assert_eq!(ev.dimension, "currency:USD");
}

#[test]
fn decision_ranks_options_highest_ev_first() {
    let src = "\
focus d
  kind decision
focus a
  kind option
focus b
  kind option
link a option-of d
link b option-of d
focus oa
  quantity 100 USD
focus ob
  quantity 300 USD
link a leads-to oa
  probability 1.0
link b leads-to ob
  probability 1.0";
    let r = parse_decisions(src);
    let dec = decision_of(&r.canonical.objects, "d").unwrap();
    // The mirror orders by EV but crowns no winner: there is no `best` field.
    let order: Vec<&str> = dec.ranked.iter().map(|e| e.option.as_str()).collect();
    assert_eq!(order, vec!["b", "a"]); // 300 before 100
    assert_eq!(dec.ranked[0].value, 300.0);
}

#[test]
fn formula_payoff_feeds_expected_value() {
    // Phase 8 → Phase 9: an outcome whose payoff is computed by a formula.
    let src = "\
focus base
  quantity 1000 USD
focus bonus
  quantity 500 USD
focus jackpot
  = base + bonus
focus opt
  kind option
link opt leads-to jackpot
  probability 1.0";
    let r = parse_decisions(src);
    assert_eq!(expected_value_of(&r.canonical.objects, "opt").unwrap().value, 1500.0);
}

#[test]
fn derived_confidence_fills_in_for_a_missing_probability() {
    // Phase 4 → Phase 9: with no authored probability, the outcome's derived
    // confidence (0.731 from one default-weight support) is used instead.
    let src = "\
focus signal
focus good-outcome
  quantity 100 USD
link signal supports good-outcome
focus opt
  kind option
link opt leads-to good-outcome";
    let r = parse_decisions(src);
    // 0.731 · 100 = 73.1.
    approx(expected_value_of(&r.canonical.objects, "opt").unwrap().value, 73.1);
}

#[test]
fn mixed_outcome_dimensions_warn_and_skip() {
    let src = "\
focus opt
  kind option
focus money
  quantity 100 USD
focus latency
  quantity 50 ms
link opt leads-to money
  probability 0.5
link opt leads-to latency
  probability 0.5";
    let r = parse_decisions(src);
    assert!(expected_value_of(&r.canonical.objects, "opt").is_none());
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("mixes outcome dimensions")));
}

#[test]
fn missing_payoff_warns_and_skips() {
    let src = "\
focus opt
  kind option
focus no-payoff
  Just a label with no quantity.
link opt leads-to no-payoff
  probability 1.0";
    let r = parse_decisions(src);
    assert!(expected_value_of(&r.canonical.objects, "opt").is_none());
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("payoff")));
}

#[test]
fn improbable_probability_mass_warns() {
    let src = "\
focus opt
  kind option
focus o1
  quantity 100 USD
focus o2
  quantity 100 USD
link opt leads-to o1
  probability 0.7
link opt leads-to o2
  probability 0.6";
    let r = parse_decisions(src);
    // Still computes (0.7·100 + 0.6·100 = 130), but flags the impossible mass.
    assert_eq!(expected_value_of(&r.canonical.objects, "opt").unwrap().value, 130.0);
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("sum to") && d.message.contains("> 1")));
}

#[test]
fn probability_on_non_leads_to_link_warns() {
    // `probability` only makes sense on a `leads-to` edge; elsewhere it's ignored.
    let r = parse_str("focus a\nfocus b\nlink a supports b\n  probability 0.5");
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("probability") && d.message.contains("ignored")));
}

#[test]
fn decision_ev_is_opt_in() {
    let src = "\
focus opt
  kind option
focus win
  quantity 100 USD
link opt leads-to win
  probability 1.0";
    assert!(expected_value_of(&parse_str(src).canonical.objects, "opt").is_none());
    assert!(expected_value_of(&parse_decisions(src).canonical.objects, "opt").is_some());
}

#[test]
fn decision_ev_example_evaluates_clean() {
    let r = parse_decisions(include_str!("../examples/decision-ev.thml"));
    assert!(!r.diagnostics.has_warnings(), "{:?}", r.diagnostics.items);
    let o = &r.canonical.objects;
    // launch-now: 0.4·900000 (computed payoff) + 0.6·(−200000) = 240000.
    assert_eq!(expected_value_of(o, "launch-now").unwrap().value, 240000.0);
    // staged-rollout: 0.7·500000 + 0.3·120000 = 386000.
    assert_eq!(expected_value_of(o, "staged-rollout").unwrap().value, 386000.0);
    let dec = decision_of(o, "go-to-market").unwrap();
    // The safer option has the higher EV, so it ranks first — but the mirror
    // reports the order, it does not declare a winner or a margin.
    let order: Vec<&str> = dec.ranked.iter().map(|e| e.option.as_str()).collect();
    assert_eq!(order, vec!["staged-rollout", "launch-now"]);
}

// --- Phase 9 polish (v0.2): what-if recompute, kinds, breakdown, units ------

#[test]
fn whatif_muting_an_outcome_recomputes_ev() {
    // Muting an outcome drops its leads-to edge, so the option's EV recomputes —
    // the computational layer now honors what-if, not just confidence/status.
    let src = "\
focus opt
  kind option
focus good
  quantity 1000 USD
focus bad
  quantity -400 USD
link opt leads-to good
  probability 0.5
link opt leads-to bad
  probability 0.5";
    let base = parse_compute_overrides(src, &[], &[]);
    assert_eq!(expected_value_of(&base.canonical.objects, "opt").unwrap().value, 300.0);
    let muted = parse_compute_overrides(src, &[], &["bad"]);
    // Only the `good` outcome remains: 0.5 · 1000 = 500.
    assert_eq!(expected_value_of(&muted.canonical.objects, "opt").unwrap().value, 500.0);
}

#[test]
fn whatif_muting_a_formula_input_breaks_it() {
    let src = "\
focus a
  quantity 100 USD
focus b
  quantity 50 USD
focus sum
  = a + b";
    let base = parse_compute_overrides(src, &[], &[]);
    assert_eq!(computed_of(&base.canonical.objects, "sum").unwrap().value, 150.0);
    let muted = parse_compute_overrides(src, &[], &["a"]);
    assert!(computed_of(&muted.canonical.objects, "sum").is_none());
    assert!(muted.diagnostics.items.iter().any(|d| d.message.contains("muted")));
}

#[test]
fn leads_to_and_option_of_infer_kinds() {
    // Always-on, provisional inference completes the option/outcome/decision triad.
    let src = "\
focus o
focus result
link o leads-to result
focus d
link o option-of d";
    let r = parse_str(src);
    let obj = &r.canonical.objects;
    assert_eq!(focus_kind(obj, "result"), Some("outcome"));
    assert_eq!(focus_kind(obj, "o"), Some("option"));
    assert_eq!(focus_kind(obj, "d"), Some("decision"));
}

#[test]
fn explicit_kind_beats_inferred_outcome() {
    // An explicit kind on a leads-to target is authoritative (no silent override).
    let src = "\
focus o
focus result
  kind observation
link o leads-to result";
    assert_eq!(focus_kind(&parse_str(src).canonical.objects, "result"), Some("observation"));
}

#[test]
fn weight_on_leads_to_warns_and_is_dropped() {
    let r = parse_str("focus o\nfocus res\nlink o strongly leads-to res");
    assert!(r.diagnostics.items.iter().any(|d| d.message.contains("leads-to") && d.message.contains("ignored")));
    assert_eq!(link(&r.canonical.objects, "o-leads-to-res").unwrap().weight, None);
}

#[test]
fn expected_value_carries_breakdown_and_downside() {
    let src = "\
focus opt
  kind option
focus win
  quantity 1000 USD
focus lose
  quantity -400 USD
link opt leads-to win
  probability 0.7
link opt leads-to lose
  probability 0.3";
    let r = parse_decisions(src);
    let ev = expected_value_of(&r.canonical.objects, "opt").unwrap();
    assert_eq!(ev.value, 580.0); // 0.7·1000 + 0.3·(−400)
    assert_eq!(ev.downside, -400.0); // worst-case outcome
    assert_eq!(ev.probability_mass, 1.0);
    assert_eq!(ev.terms.len(), 2);
    let win = ev.terms.iter().find(|t| t.outcome == "win").unwrap();
    assert_eq!((win.probability, win.payoff, win.contribution), (0.7, 1000.0, 700.0));
}

#[test]
fn computed_quantity_uses_human_units() {
    // 5 GB + 3 GB reads as 8 GB, not 8000000000 B — computed reads like authored.
    let src = "\
focus a
  quantity 5 GB
focus b
  quantity 3 GB
focus total
  = a + b";
    let r = parse_formulas(src);
    let q = computed_of(&r.canonical.objects, "total").unwrap();
    assert_eq!((q.value, q.unit.as_str(), q.dimension.as_str()), (8.0, "GB", "information"));
}

#[test]
fn release_bet_capstone_weaves_the_stack_and_flips() {
    // The capstone: formula payoffs (§4.8) + a derived-confidence probability
    // (§10.3) + EV ranking (§10.6) + a what-if that flips it (§10.5).
    let src = include_str!("../examples/release-bet.thml");
    let base = parse_decisions(src);
    assert!(!base.diagnostics.has_warnings(), "{:?}", base.diagnostics.items);
    let o = &base.canonical.objects;
    assert_eq!(computed_of(o, "ship-clean").unwrap().value, 400000.0); // formula payoff
    assert_eq!(computed_of(o, "hold-pays-off").unwrap().value, 250000.0);
    approx(derived_of(o, "hold-pays-off").unwrap(), 0.881); // becomes the probability
    let dec = decision_of(o, "release-decision").unwrap();
    assert_eq!(dec.ranked[0].option, "hold-week"); // 212250 vs 180000 as written
    // Mute one piece of evidence: belief in hold-pays-off falls, its EV drops
    // below shipping, and the EV ordering flips — what-if reaching the EV layer.
    let muted = parse_compute_overrides(src, &[], &["canary-clean"]);
    assert_eq!(decision_of(&muted.canonical.objects, "release-decision").unwrap().ranked[0].option, "ship-now");
}

// --- Conformance (formal track): bundled examples stay strict-clean ---------

/// Every shipped example must parse with zero errors AND zero warnings. This is
/// the load-bearing regression guard as the language grows: any change that
/// makes an example trip a lint or a new diagnostic fails here.
#[test]
fn bundled_examples_are_strict_clean() {
    let examples: &[(&str, &str)] = &[
        ("ai-and-jobs", include_str!("../examples/ai-and-jobs.thml")),
        ("incident-742", include_str!("../examples/incident-742.thml")),
        ("multi-agent-debate", include_str!("../examples/multi-agent-debate.thml")),
        ("decision-record", include_str!("../examples/decision-record.thml")),
        ("agent-memory", include_str!("../examples/agent-memory.thml")),
        ("estimate-revised", include_str!("../examples/estimate-revised.thml")),
        ("sensitivity-demo", include_str!("../examples/sensitivity-demo.thml")),
        ("capacity-plan", include_str!("../examples/capacity-plan.thml")),
        ("cost-model", include_str!("../examples/cost-model.thml")),
        ("decision-ev", include_str!("../examples/decision-ev.thml")),
        ("release-bet", include_str!("../examples/release-bet.thml")),
        ("canonical-core", include_str!("../examples/canonical-core.thml")),
        ("nested-scope", include_str!("../examples/nested-scope.thml")),
        ("profile-dialect", include_str!("../examples/profile-dialect.thml")),
        ("why-harvard", include_str!("../examples/why-harvard.thml")),
        ("self-audit", include_str!("../examples/self-audit.thml")),
        // shared-defs is dependency-free, so it is clean as a single document;
        // imports-demo references `base.*` and is checked as a project below.
        ("shared-defs", include_str!("../examples/shared-defs.thml")),
    ];
    for (name, src) in examples {
        let r = parse_str(src);
        assert!(
            !r.diagnostics.has_errors(),
            "{name}: unexpected errors {:?}",
            r.diagnostics.items
        );
        assert!(
            !r.diagnostics.has_warnings(),
            "{name}: unexpected warnings {:?}",
            r.diagnostics.items
        );
    }
}

// --- Nested scopes & inheritance (Phase 5, Stage 2) -----------------------

fn scope_of<'a>(objs: &'a [Object], id: &str) -> &'a crate::canonical::Scope {
    objs.iter()
        .find_map(|o| match o {
            Object::Scope(s) if s.id == id => Some(s),
            _ => None,
        })
        .unwrap_or_else(|| panic!("no scope `{id}`"))
}

fn focus_field<'a>(objs: &'a [Object], id: &str, name: &str) -> Option<&'a Value> {
    focus(objs, id)
        .unwrap_or_else(|| panic!("no focus `{id}`"))
        .fields
        .0
        .iter()
        .find(|(k, _)| k == name)
        .map(|(_, v)| v)
}

const NESTED: &str = "\
scope incident
  source pagerduty
  observed-at 2026-02-11T09:00Z
  focus a
    First.
  focus b
    Second.
  scope inner
    observed-at 2026-02-11T10:00Z
    focus c
      Third.
";

#[test]
fn scope_includes_direct_children() {
    let r = parse_str(NESTED);
    let s = scope_of(&r.canonical.objects, "incident");
    assert_eq!(s.includes, vec!["a", "b", "inner"]);
}

#[test]
fn nested_subscope_membership() {
    let r = parse_str(NESTED);
    assert_eq!(scope_of(&r.canonical.objects, "inner").includes, vec!["c"]);
}

#[test]
fn member_inherits_scope_provenance() {
    let r = parse_str(NESTED);
    let objs = &r.canonical.objects;
    assert!(matches!(focus_field(objs, "a", "source"), Some(Value::Ref(s)) if s == "pagerduty"));
    assert!(
        matches!(focus_field(objs, "a", "observed-at"), Some(Value::Time(t)) if t == "2026-02-11T09:00Z")
    );
}

#[test]
fn member_overrides_inherited() {
    // A member that sets its own value keeps it (member-wins).
    let r = parse_str("scope s\n  source pagerduty\n  focus a\n    source synthetic");
    assert!(matches!(
        focus_field(&r.canonical.objects, "a", "source"),
        Some(Value::Ref(s)) if s == "synthetic"
    ));
}

#[test]
fn inheritance_cascades_through_subscope() {
    // `c` sits in `inner` (observed-at 10:00) inside `incident` (source
    // pagerduty, observed-at 09:00): the inner timestamp wins, the outer source
    // still flows through.
    let r = parse_str(NESTED);
    let objs = &r.canonical.objects;
    assert!(
        matches!(focus_field(objs, "c", "observed-at"), Some(Value::Time(t)) if t == "2026-02-11T10:00Z")
    );
    assert!(matches!(focus_field(objs, "c", "source"), Some(Value::Ref(s)) if s == "pagerduty"));
}

#[test]
fn nonscope_with_children_warns() {
    // Only a scope may contain nested objects.
    let r = parse_str("focus parent\n  focus child");
    assert!(
        r.diagnostics
            .items
            .iter()
            .any(|d| d.message.contains("only a scope may contain")),
        "expected a non-scope-children warning: {:?}",
        r.diagnostics.items
    );
}

#[test]
fn nested_scope_example_is_strict_clean() {
    let r = parse_str(include_str!("../examples/nested-scope.thml"));
    assert!(!r.diagnostics.has_errors(), "errors: {:?}", r.diagnostics.items);
    assert!(!r.diagnostics.has_warnings(), "warnings: {:?}", r.diagnostics.items);
}

// --- Profiles (Phase 5, Stage 3) ------------------------------------------

#[test]
fn unknown_relation_warns_without_profile() {
    // The relation lint is newly active in Phase 5: an off-vocabulary relation
    // warns when no profile declares it. (`correlates` is genuinely non-core —
    // `mitigates` was promoted to a core defense relation in the Phase 5 review.)
    let r = parse_str("focus a\nfocus b\nlink a correlates b");
    assert!(
        r.diagnostics
            .items
            .iter()
            .any(|d| d.message.contains("unknown relation `correlates`")),
        "diags: {:?}",
        r.diagnostics.items
    );
}

#[test]
fn unknown_field_and_posture_warn_without_profile() {
    let r = parse_str("focus x\n  likelihood 0.5\nstance ops flags x");
    let msgs: Vec<&str> = r.diagnostics.items.iter().map(|d| d.message.as_str()).collect();
    assert!(msgs.iter().any(|m| m.contains("unknown field `likelihood`")), "diags: {msgs:?}");
    assert!(msgs.iter().any(|m| m.contains("unknown posture `flags`")), "diags: {msgs:?}");
}

#[test]
fn profile_allows_custom_relation() {
    let r = parse_str("profile p\n  relations correlates\nfocus a\nfocus b\nlink a correlates b");
    assert!(!r.diagnostics.has_warnings(), "warnings: {:?}", r.diagnostics.items);
}

#[test]
fn profile_allows_custom_kind_field_and_posture() {
    let src = "profile p\n  kinds risk\n  fields likelihood\n  postures flags\n\
focus x\n  kind risk\n  likelihood 0.5\nstance ops flags x";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_warnings(), "warnings: {:?}", r.diagnostics.items);
    assert_eq!(focus_kind(&r.canonical.objects, "x"), Some("risk"));
}

#[test]
fn profile_object_captures_its_lists() {
    let r = parse_str("profile risk-analysis\n  kinds risk, mitigation\n  relations correlates");
    let p = r
        .canonical
        .objects
        .iter()
        .find_map(|o| match o {
            Object::Profile(p) => Some(p),
            _ => None,
        })
        .expect("a profile object");
    assert_eq!(p.name, "risk-analysis");
    assert_eq!(p.kinds, vec!["risk", "mitigation"]);
    assert_eq!(p.relations, vec!["correlates"]);
}

#[test]
fn profile_dialect_example_is_strict_clean() {
    let r = parse_str(include_str!("../examples/profile-dialect.thml"));
    assert!(!r.diagnostics.has_errors(), "errors: {:?}", r.diagnostics.items);
    assert!(!r.diagnostics.has_warnings(), "warnings: {:?}", r.diagnostics.items);
}

// --- Imports & namespaces (Phase 5, Stage 4) ------------------------------

fn project(entry: &str, sources: &[(&str, &str)]) -> crate::ParseResult {
    let map: std::collections::HashMap<String, String> = sources
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    parse_project(entry, &map, Options::default())
}

const SHARED: &str = include_str!("../examples/shared-defs.thml");
const IMPORTER: &str = include_str!("../examples/imports-demo.thml");
const GRAND: &str = include_str!("../examples/grand-tour.thml");

/// Every flag on — what the playground runs.
fn full_options() -> Options {
    Options {
        emit_acts: false,
        derive_confidence: true,
        argument_status: true,
        sensitivity: true,
        formulas: true,
        decision_ev: true,
        audit: true,
    }
}

#[test]
fn import_merges_namespaced_objects() {
    let r = project(IMPORTER, &[("shared-defs", SHARED)]);
    let objs = &r.canonical.objects;
    assert!(focus(objs, "base.capacity-budget").is_some(), "missing imported focus");
    assert!(focus(objs, "rollout-plan").is_some(), "missing entry focus");
    // The imported scope and its membership were namespaced too.
    assert_eq!(
        scope_of(objs, "base.shared").includes,
        vec!["base.capacity-budget", "base.slo-target"]
    );
}

#[test]
fn qualified_ref_resolves() {
    let r = project(IMPORTER, &[("shared-defs", SHARED)]);
    assert!(
        !r.diagnostics.has_errors() && !r.diagnostics.has_warnings(),
        "diags: {:?}",
        r.diagnostics.items
    );
    // The entry's `link … depends-on base.capacity-budget` resolved to the
    // namespaced imported focus.
    let to_import = r
        .canonical
        .objects
        .iter()
        .any(|o| matches!(o, Object::Link(l) if l.to == "base.capacity-budget"));
    assert!(to_import, "expected a link to base.capacity-budget");
}

#[test]
fn importer_alone_has_unresolved_refs() {
    // Single-document parse can't resolve `base.*`, so it is not strict-clean —
    // which is exactly why importers are checked as a project.
    let r = parse_str(IMPORTER);
    assert!(r.diagnostics.has_warnings(), "expected unresolved-ref warnings");
}

#[test]
fn unknown_import_warns() {
    let r = project("import nope as n", &[]);
    assert!(
        r.diagnostics.items.iter().any(|d| d.message.contains("unknown import `nope`")),
        "diags: {:?}",
        r.diagnostics.items
    );
}

#[test]
fn import_cycle_is_detected_and_warns() {
    let a = "import b as b\nfocus a-thing\n  An a.";
    let b = "import a as a\nfocus b-thing\n  A b.";
    let r = project(a, &[("a", a), ("b", b)]);
    assert!(
        r.diagnostics.items.iter().any(|d| d.message.contains("import cycle")),
        "diags: {:?}",
        r.diagnostics.items
    );
}

#[test]
fn project_examples_are_strict_clean() {
    // Importer examples are clean only when parsed as a project with their
    // dependency (a single-doc parse leaves the `base.*` refs unresolved).
    for (name, entry) in [("imports-demo", IMPORTER), ("grand-tour", GRAND)] {
        let r = project(entry, &[("shared-defs", SHARED)]);
        assert!(!r.diagnostics.has_errors(), "{name}: errors {:?}", r.diagnostics.items);
        assert!(!r.diagnostics.has_warnings(), "{name}: warnings {:?}", r.diagnostics.items);
    }
}

#[test]
fn grand_tour_computes_under_full_options() {
    // The showcase must also stay clean with the whole computational stack on,
    // and its decision EV must rank the migrate option first (chained formula payoff).
    let map: std::collections::HashMap<String, String> =
        [("shared-defs".to_string(), SHARED.to_string())].into_iter().collect();
    let r = parse_project(GRAND, &map, full_options());
    assert!(!r.diagnostics.has_errors(), "errors: {:?}", r.diagnostics.items);
    assert!(!r.diagnostics.has_warnings(), "warnings: {:?}", r.diagnostics.items);
    let decision = focus(&r.canonical.objects, "capacity-decision").expect("decision focus");
    assert_eq!(decision.decision.as_ref().expect("decision EV").ranked[0].option, "migrate");
}

// --- Phase 5 review: action kind, decision-graph lint, the argument→EV bridge,
//     mitigates as defense, and the undercut/rebut distinction ----------------

#[test]
fn action_is_a_valid_kind() {
    // A thing you *do* (plan / intervention / mitigation) has its own kind now.
    let r = parse_str("focus visit-plan\n  kind action\n  A plan.\nfocus g\nlink visit-plan supports g");
    assert!(!r.diagnostics.has_warnings(), "diags: {:?}", r.diagnostics.items);
    assert_eq!(focus_kind(&r.canonical.objects, "visit-plan"), Some("action"));
}

#[test]
fn leads_to_self_loop_warns() {
    let r = parse_str("focus x\nlink x leads-to x");
    assert!(
        r.diagnostics.items.iter().any(|d| d.message.contains("points outcome `x` at itself")),
        "diags: {:?}",
        r.diagnostics.items
    );
}

#[test]
fn mixed_decision_flags_the_unwired_option() {
    // The Harvard bug: one option is EV-wired, its sibling is not — the bare
    // option would be silently dropped from the ranking, so warn.
    let src = "\
focus d
  kind decision
focus opt-a
  kind option
focus opt-b
  kind option
focus win
  quantity 10 USD
link opt-a option-of d
link opt-b option-of d
link opt-a leads-to win
  probability 0.5";
    let r = parse_str(src);
    assert!(
        r.diagnostics.items.iter().any(|d| d.message.contains("option `opt-b`")
            && d.message.contains("expected-value ranking")),
        "diags: {:?}",
        r.diagnostics.items
    );
}

#[test]
fn pure_choice_decision_is_not_flagged() {
    // A decision whose options carry no `leads-to` outcomes at all is a valid
    // pure-choice decision — the mixed-EV lint must not fire on it.
    let src = "\
focus d
  kind decision
focus opt-a
  kind option
focus opt-b
  kind option
link opt-a option-of d
link opt-b option-of d";
    let r = parse_str(src);
    assert!(!r.diagnostics.has_warnings(), "diags: {:?}", r.diagnostics.items);
}

#[test]
fn mitigates_defends_an_option_against_a_risk() {
    // guard mitigates risk, risk opposes option: the mitigation attacks the risk,
    // so the risk is defeated and the option it attacked is reinstated.
    let src = "\
focus risk
focus option
focus guard
  kind action
link risk opposes option
link guard mitigates risk";
    let r = parse_status(src);
    let o = &r.canonical.objects;
    assert_eq!(status_of(o, "guard"), Some("in"));
    assert_eq!(status_of(o, "risk"), Some("out"));
    assert_eq!(status_of(o, "option"), Some("in"));
}

#[test]
fn undercutting_an_inference_weakens_it() {
    // `undercuts` aimed at a *link* attacks the inference, halving that support's
    // weight (default 0.5) — something `opposes` (a node rebuttal) cannot do.
    let plain = parse_derived("focus premise\nfocus claim\nlink premise supports claim");
    approx(derived_of(&plain.canonical.objects, "claim").unwrap(), 0.731);
    let undercut = parse_derived(
        "focus premise\nfocus claim\nfocus doubt\nlink inference: premise supports claim\nlink doubt undercuts inference",
    );
    // weight 0.5 · health 0.5 = 0.25 → logistic(2·0.25) = 0.622 < 0.731.
    approx(derived_of(&undercut.canonical.objects, "claim").unwrap(), 0.622);
}

#[test]
fn why_harvard_computes_and_ranks_both_options() {
    // The showcase decision must stay clean under the full stack, rank harvard
    // first, and — the fix for the original self-loop bug — rank *both* options
    // rather than silently dropping the unwired one.
    let r = parse_str_with(include_str!("../examples/why-harvard.thml"), full_options());
    assert!(!r.diagnostics.has_errors(), "errors: {:?}", r.diagnostics.items);
    assert!(!r.diagnostics.has_warnings(), "warnings: {:?}", r.diagnostics.items);
    let d = decision_of(&r.canonical.objects, "where-to-go").expect("decision EV");
    assert_eq!(d.ranked[0].option, "harvard");
    assert_eq!(d.ranked.len(), 2);
    assert_eq!(expected_value_of(&r.canonical.objects, "harvard").unwrap().value, 465000.0);
    assert_eq!(expected_value_of(&r.canonical.objects, "state-honors").unwrap().value, 325000.0);
}

// --- Mirror conflict report (§10.7): the engine's second reading -----------

fn parse_audit(src: &str) -> crate::ParseResult {
    parse_str_with(src, Options { audit: true, ..Options::default() })
}

fn conflicts_of(r: &crate::ParseResult) -> &[crate::canonical::Conflict] {
    r.canonical.audit.as_ref().map(|a| a.conflicts.as_slice()).unwrap_or(&[])
}

#[test]
fn audit_flags_high_confidence_on_a_defeated_claim() {
    // The flagship mirror: the author holds a claim at 0.9 that its own opposing
    // observation defeats. Diagnostically clean, but the structure disagrees.
    let src = "\
focus claim
focus rebuttal
link rebuttal opposes claim
ops-agent holds claim
  confidence 0.9";
    let r = parse_audit(src);
    assert!(!r.diagnostics.has_warnings(), "should be clean: {:?}", r.diagnostics.items);
    let c = conflicts_of(&r);
    assert_eq!(c.len(), 1, "conflicts: {c:?}");
    assert_eq!(c[0].kind, "confidence-vs-status");
    assert!(c[0].subjects.contains(&"claim".to_string()));
}

#[test]
fn audit_is_silent_when_belief_matches_structure() {
    // High confidence in a claim that survives (its attacker is itself defeated):
    // the structure agrees, so there is nothing to flag.
    let src = "\
focus claim
focus rebuttal
focus counter
link rebuttal opposes claim
link counter opposes rebuttal
ops-agent holds claim
  confidence 0.9";
    assert!(conflicts_of(&parse_audit(src)).is_empty(), "expected no conflicts");
}

#[test]
fn audit_is_opt_in() {
    // Default parse computes no audit at all (the conflict channel is absent).
    let src = "focus claim\nfocus rebuttal\nlink rebuttal opposes claim\nops-agent holds claim\n  confidence 0.9";
    assert!(parse_str(src).canonical.audit.is_none());
}

#[test]
fn self_audit_example_is_clean_in_form_but_conflicted_in_reasoning() {
    let src = include_str!("../examples/self-audit.thml");
    // Clean form — it belongs in the strict-clean bundle.
    let plain = parse_str(src);
    assert!(!plain.diagnostics.has_errors() && !plain.diagnostics.has_warnings(), "{:?}", plain.diagnostics.items);
    // But the mirror catches the agent holding a defeated claim at high confidence.
    let audited = parse_audit(src);
    let c = conflicts_of(&audited);
    assert_eq!(c.len(), 1, "conflicts: {c:?}");
    assert_eq!(c[0].kind, "confidence-vs-status");
    assert!(c[0].subjects.contains(&"cache-is-safe".to_string()));
}
