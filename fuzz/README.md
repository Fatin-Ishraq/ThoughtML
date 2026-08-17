# Fuzzing the ThoughtML parser

`SECURITY.md` states that no byte sequence makes the parser panic, hang, or
exhaust memory. These targets are what turns that from an assertion into a
result — the unit tests cover the cases we *thought* of, and the audit that
prompted this found three stack overflows none of them had reached.

Two targets, matching the two paths real callers take:

| Target | Covers |
|---|---|
| `parse` | `thoughtml check`, plain `thoughtml <file>`, every playground keystroke |
| `compute` | `--compute`, `--html`, `thoughtml stream`, the playground's full stack |

## Running it

Fuzzing needs **nightly** and a sanitizer runtime, so it does not run on
Windows MSVC. On Linux or macOS:

```sh
cargo install cargo-fuzz
cargo +nightly fuzz run parse
cargo +nightly fuzz run compute
```

CI (`.github/workflows/fuzz.yml`) runs both for a bounded time on every push and
on a weekly schedule, so this stays a live check rather than something last run
once. A crash is written to `fuzz/artifacts/` and uploaded by the workflow;
reproduce it with:

```sh
cargo +nightly fuzz run parse fuzz/artifacts/parse/crash-<hash>
```

## The corpus

`corpus/` seeds the fuzzer with every bundled example plus a few shapes drawn
from real findings — deep parenthesis nesting, a long `causes` chain, deep scope
nesting, a non-ASCII unit, and line-separator characters. Starting near the
known-interesting regions beats starting from random bytes.

Anything the fuzzer finds should become a case in
`crates/thoughtml/src/integration_tests.rs`, next to the existing recursion
tests, so the suite keeps checking it without needing a fuzzer.
