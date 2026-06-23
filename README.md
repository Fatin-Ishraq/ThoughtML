<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" />
    <img alt="ThoughtML" src="assets/wordmark-light.svg" width="360" />
  </picture>
</p>

<p align="center"><strong>A plain-text language for reasoning you can check.</strong></p>

<p align="center">
  <a href="https://fatin-ishraq.github.io/ThoughtML/"><img alt="docs" src="https://img.shields.io/badge/docs-The%20ThoughtML%20Book-1f6feb" /></a>
  <a href="https://github.com/Fatin-Ishraq/ThoughtML/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Fatin-Ishraq/ThoughtML/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="license: MIT" src="https://img.shields.io/badge/license-MIT-green" /></a>
  <a href="CHANGELOG.md"><img alt="version" src="https://img.shields.io/badge/version-0.1.0-blueviolet" /></a>
</p>

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

A hiring call, written as ThoughtML:

```thml
focus strong-hire
  kind claim
  Alex is a strong hire.

focus aced-interview
  kind observation
  Aced the system-design round.

focus take-home-failed
  kind observation
  The take-home didn't run — tests were failing.

link aced-interview supports strong-hire
link take-home-failed opposes strong-hire

panel holds strong-hire
  confidence 0.9 assumed
```

The document is **clean** — no errors, no warnings. But run the mirror over it
(`thoughtml --audit`) and it reports a conflict:

```json
"audit": {
  "conflicts": [
    {
      "kind": "confidence-vs-status",
      "severity": "error",
      "message": "`panel` asserts confidence 0.90 in `strong-hire`, but your own structure defeats it (argument status: out)"
    }
  ]
}
```

The panel is 90% sure of a claim its *own* recorded evidence defeats — it noted
the take-home failed, then made the offer anyway. ThoughtML surfaces that
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

**Run the parser (CLI)** — from the repository root:

```sh
cargo run -p thoughtml -- examples/self-audit.thml             # canonical JSON + diagnostics
cargo run -p thoughtml -- --compute examples/why-harvard.thml  # the mirror's opt-in readings
cargo run -p thoughtml -- --strict-provenance doc.thml         # warn on numbers with no basis
cargo test
```

**Export a standalone view** — bake a document into one self-contained, interactive
HTML file that opens in any browser (no server, no wasm):

```sh
cargo run -p thoughtml -- --html -o decision-record.html examples/decision-record.thml
```

**Run the playground (live editor + graph):**

```sh
cd web
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

- **Reference parser** — [`crates/thoughtml`](crates/thoughtml)
  (Rust): source → surface AST → canonical objects → JSON, with diagnostics. The
  single source of truth for the language.
- **wasm bindings** — [`crates/thoughtml-wasm`](crates/thoughtml-wasm): the same
  parser, compiled for the web — so the browser and the CLI can never drift.
- **Playground** — [`web`](web): a live editor and
  graph view, in the spirit of mermaid.live.
- **Standalone viewer** — `thoughtml --html` bakes a document into one
  self-contained, interactive HTML file (the graph, the lenses, the as-of
  timeline — model inlined, no wasm, no server). The renderer is a wasm-free core
  shared with the playground, so both render identically. The graph is an *output
  of the toolchain*, alongside JSON.

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
