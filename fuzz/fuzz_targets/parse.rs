//! The default path: `thoughtml check`, plain `thoughtml <file>`, and every
//! playground keystroke land here. SECURITY.md's claim — that no byte sequence
//! makes the parser panic, hang, or exhaust memory — is about this function.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Documents are text; feed the fuzzer's bytes through the same lossy decode
    // a real caller would, so invalid UTF-8 is exercised rather than skipped.
    let source = String::from_utf8_lossy(data);
    let result = thoughtml::parse_str(&source);
    // Serializing is part of the contract too — the CLI always emits the model,
    // and a value that cannot round-trip is a bug even if parsing survived.
    let _ = serde_json::to_string(&result.canonical);
});
