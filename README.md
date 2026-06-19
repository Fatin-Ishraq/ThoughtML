# ThoughtML

A plain-text language for **reasoning you can check**.

You write down what you believe and why — claims, evidence, who holds what, how
confident, as of when — and ThoughtML reads it back as a typed, dated,
defeasible graph. A second, mechanical reading can then tell you where your own
structure disagrees with what you said.

ThoughtML is a **mirror, not an oracle**: it shows you the conflict; it does not
make the call.

## What it looks like

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
disagreement; it doesn't decide for you. (And the `0.9` says it's `assumed`, not
measured — provenance you can see.)

## Why

Prose hides the shape of an argument. A bullet list flattens it. ThoughtML keeps
the shape: every claim is typed, every link has a direction and a meaning,
beliefs carry confidence and a date, and evidence can be defeated by other
evidence. Because the structure is explicit, a machine can read it a *second*
way — and where the two readings disagree, that gap is worth your attention.

It's built for an age where an AI agent can emit this structure at no cost, and a
human (or another agent, or CI) audits it. The point isn't to compute the answer.
It's to make the reasoning legible enough that its flaws can't hide.

## The pieces

- **Reference parser** — [`tools/thoughtml-parser-rs`](tools/thoughtml-parser-rs)
  (Rust): source → surface AST → canonical objects → JSON, with diagnostics. The
  single source of truth for the language.
- **wasm bindings** — [`tools/thoughtml-wasm`](tools/thoughtml-wasm): the same
  parser, compiled for the web (it runs the exact same path as the CLI).
- **Playground** — [`tools/thoughtml-web`](tools/thoughtml-web): a live editor
  and graph view, in the spirit of mermaid.live.

## Quickstart

**CLI** (the parser):

```sh
cd tools/thoughtml-parser-rs
cargo run -- path/to/doc.thml              # canonical JSON + diagnostics
cargo run -- --compute path/to/doc.thml    # plus the opt-in second readings
cargo run -- --strict-provenance doc.thml  # warn on numbers with no basis
cargo test
```

**Playground** (live editor + graph):

```sh
cd tools/thoughtml-web
npm install
npm run wasm    # build the parser to wasm (uses the rustup toolchain)
npm run dev
```

## Core ideas, briefly

- **Typed reasoning.** A focus is an `observation`, `claim`, `hypothesis`,
  `option`, `decision`, `goal`, `assumption`, … — not just a node.
- **Defeasible evidence.** `supports` / `opposes` / `undercuts` form an argument
  graph; an opt-in grounded status reads each node as `in` / `out` / `undecided`.
- **Time and revision.** Beliefs are dated and can be revised; the playground has
  an as-of view.
- **Honest numbers.** One strength encoding (numeric `weight`); authored numbers
  can declare their basis — `measured` / `estimated` / `assumed`.
- **The mirror.** An opt-in conflict report flags where your structure disagrees
  with your stated confidence — it reports, it does not decide.

## Status

**v0.1.0** — the first public release. Real and usable; the surface may still
move (hence 0.x, not 1.0). See [CHANGELOG.md](CHANGELOG.md) for what this release
deliberately removed, and [project_plan.md](project_plan.md) for the full design
history.

## License

[MIT](LICENSE).
