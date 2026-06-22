# ThoughtML

**A plain-text language for reasoning you can check.**

[![docs](https://img.shields.io/badge/docs-The%20ThoughtML%20Book-1f6feb)](https://fatin-ishraq.github.io/ThoughtML/)
[![CI](https://github.com/Fatin-Ishraq/ThoughtML/actions/workflows/ci.yml/badge.svg)](https://github.com/Fatin-Ishraq/ThoughtML/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![version](https://img.shields.io/badge/version-0.1.0-blueviolet)](CHANGELOG.md)

You write down what you believe and *why* — claims, evidence, who holds what, how
confident, as of when — and ThoughtML reads it back as a typed, dated, defeasible
graph. A second, mechanical reading then tells you where your own structure
disagrees with what you said.

> **ThoughtML is a mirror, not an oracle.** It shows you the conflict; it does not
> make the call.

### 📖 [Read the docs → fatin-ishraq.github.io/ThoughtML](https://fatin-ishraq.github.io/ThoughtML/)

A guided [tutorial](https://fatin-ishraq.github.io/ThoughtML/tutorial/index.html),
a complete [language reference](https://fatin-ishraq.github.io/ThoughtML/reference/index.html),
[the mirror](https://fatin-ishraq.github.io/ThoughtML/mirror/index.html), and
practical [guides](https://fatin-ishraq.github.io/ThoughtML/guides/use-cases.html).

---

## The idea, in one example

```thml
focus cache-is-safe
  kind claim
  The new cache layer is safe to ship today.

focus load-test-passed
  kind observation
  Load test at 2x peak traffic passed with no errors.

focus stale-reads
  kind observation
  Staging showed stale reads under cache eviction.

link load-test-passed supports cache-is-safe
link stale-reads opposes cache-is-safe

ops-agent holds cache-is-safe
  confidence 0.9 assumed
  note Shipping — the load test passed.
```

This document is *clean* — no errors, no warnings. But the mirror flags a
**conflict**: the agent holds `cache-is-safe` at 0.9, while its own recorded
evidence (`stale-reads opposes cache-is-safe`) defeats that claim. It wrote down
the counter-observation, then shipped anyway. ThoughtML surfaces that
disagreement; it doesn't decide for you. (And that `0.9` declares itself
`assumed`, not measured — provenance you can see.)

That's the whole language in one screen. [Walk through it step by
step →](https://fatin-ishraq.github.io/ThoughtML/tutorial/index.html)

## Why a language for reasoning?

Prose hides the shape of an argument. A bullet list flattens it. ThoughtML keeps
the shape: every claim is typed, every link has a direction and a meaning, beliefs
carry confidence and a date, and evidence can be defeated by other evidence.
Because the structure is explicit, a machine can read it a *second* way — and
where the two readings disagree, that gap is worth your attention.

It's built for an age where an AI agent can emit this structure at no cost, and a
human (or another agent, or CI) audits it. The point isn't to *compute the
answer.* It's to make the reasoning legible enough that its flaws can't hide.

## What you'd use it for

- **Decision records (ADRs) you can lint** — the options, the evidence, the open
  question that blocks sign-off, all checkable.
- **AI-agent reasoning a human or CI can audit** — the agent emits its reasoning;
  the mirror catches where its confidence betrays its own structure.
  ([guide](https://fatin-ishraq.github.io/ThoughtML/guides/for-ai-agents.html))
- **Design & code review of an argument** — surface "you hold this at 0.9, but
  your own listed risk defeats it."
- **Incident postmortems** as checkable causal graphs; **research / claim maps**
  with provenance on every number.

More in [Use cases →](https://fatin-ishraq.github.io/ThoughtML/guides/use-cases.html)

## Quickstart

ThoughtML is a *language*; this repo is its **reference implementation** — a
parser, a wasm build of that same parser, and a browser playground. You don't
need any Rust to use the language, only to run the implementation.

**Run the parser (CLI):**

```sh
cd tools/thoughtml-parser-rs
cargo run -- path/to/doc.thml              # canonical JSON + diagnostics
cargo run -- --compute path/to/doc.thml    # plus the mirror's opt-in readings
cargo run -- --strict-provenance doc.thml  # warn on numbers with no basis
cargo test
```

**Run the playground (live editor + graph):**

```sh
cd tools/thoughtml-web
npm install
npm run wasm    # build the parser to wasm (uses the rustup toolchain)
npm run dev
```

See [Installation](https://fatin-ishraq.github.io/ThoughtML/getting-started/installation.html)
for details.

## Core ideas

- **Typed reasoning.** A focus is an `observation`, `claim`, `hypothesis`,
  `option`, `decision`, `goal`, `assumption`, … — not just a node.
- **Defeasible evidence.** `supports` / `opposes` / `undercuts` form an argument
  graph; an opt-in grounded status reads each node as `in` / `out` / `undecided`.
- **Time and revision.** Beliefs are dated and can be revised; the playground has
  an as-of view that replays the reasoning.
- **Honest numbers.** One strength encoding (numeric `weight`); authored numbers
  can declare their basis — `measured` / `estimated` / `assumed`.
- **The mirror.** An opt-in conflict report flags where your structure disagrees
  with your stated confidence — it reports, it does not decide.

## How it's built

- **Reference parser** — [`tools/thoughtml-parser-rs`](tools/thoughtml-parser-rs)
  (Rust): source → surface AST → canonical objects → JSON, with diagnostics. The
  single source of truth for the language.
- **wasm bindings** — [`tools/thoughtml-wasm`](tools/thoughtml-wasm): the same
  parser, compiled for the web — so the browser and the CLI can never drift.
- **Playground** — [`tools/thoughtml-web`](tools/thoughtml-web): a live editor and
  graph view, in the spirit of mermaid.live.

## Status

**v0.1.0** — the first public release. Real and usable; the surface may still move
(hence 0.x, not 1.0). See [CHANGELOG.md](CHANGELOG.md) for what this release
deliberately removed, and the
[documentation](https://fatin-ishraq.github.io/ThoughtML/) for the full language.

## Contributing

Issues and ideas are welcome — open one
[here](https://github.com/Fatin-Ishraq/ThoughtML/issues). The reference parser is
the source of truth for the language; the docs are derived from it, so if the two
ever disagree, that's a bug worth reporting.

## License

[MIT](LICENSE) © 2026 Fatin Ishraq.
