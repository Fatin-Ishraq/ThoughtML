//! The full analysis stack, as `--compute`, `--html`, `thoughtml stream` and the
//! playground run it: derived confidence, grounded status, leverage, formulas,
//! decision EV, and the audit. Three of the four aborts found in the 2026-08-17
//! audit lived behind these passes rather than in parsing.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let source = String::from_utf8_lossy(data);
    let opts = thoughtml::Options {
        emit_acts: true,
        derive_confidence: true,
        argument_status: true,
        sensitivity: true,
        formulas: true,
        decision_ev: true,
        audit: true,
        strict_provenance: true,
    };
    let result = thoughtml::parse_str_with(&source, opts);
    let _ = serde_json::to_string(&result.canonical);
});
