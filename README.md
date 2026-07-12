<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" />
    <img alt="ThoughtML" src="assets/wordmark-light.svg" width="360" />
  </picture>
</p>

<p align="center"><strong>A plain-text language for reasoning you can check.</strong></p>

<p align="center">
  <a href="https://fatin-ishraq.github.io/ThoughtML/">📖 Book</a> &nbsp;·&nbsp;
  <a href="https://fatin-ishraq.github.io/ThoughtML/playground/">▶ Playground</a> &nbsp;·&nbsp;
  <a href="llms.txt">🤖 llms.txt</a> &nbsp;·&nbsp;
  <a href="examples">📁 Examples</a>
</p>

<p align="center">
  <a href="https://fatin-ishraq.github.io/ThoughtML/"><img alt="docs" src="https://img.shields.io/badge/docs-The%20ThoughtML%20Book-1f6feb" /></a>
  <a href="https://fatin-ishraq.github.io/ThoughtML/playground/"><img alt="playground" src="https://img.shields.io/badge/playground-try%20it%20live-8957e5" /></a>
  <a href="https://github.com/Fatin-Ishraq/ThoughtML/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Fatin-Ishraq/ThoughtML/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="license: MIT" src="https://img.shields.io/badge/license-MIT-green" /></a>
  <a href="CHANGELOG.md"><img alt="version" src="https://img.shields.io/badge/version-0.2.0-blueviolet" /></a>
</p>

---

Prose is good at *stating* a conclusion and terrible at *showing its shape*. You can
write three confident paragraphs that quietly contradict themselves, and no tool will
say a word.

ThoughtML is a small language that fixes that. You write down what you believe and
**why** — claims, evidence, who holds what, how confident, as of when — and it reads
back a typed, dated, defeasible graph. Then it reads that graph a *second* time,
mechanically, and tells you where your own structure disagrees with what you said.

> **It's a mirror, not an oracle.** It shows you the conflict. It does not make the call.

## Watch it catch a mistake

A hiring decision, written as ThoughtML:

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

This document is **clean** — zero errors, zero warnings. The syntax is perfect. And
yet it's *wrong*, in a way no spell-checker or linter would ever catch. Run the mirror
over it (`thoughtml --audit`):

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

The panel is **90% sure** of a claim its *own recorded evidence* defeats — it wrote
down that the take-home failed, then made the offer anyway. Nothing about the text is
malformed; the *reasoning* is. ThoughtML surfaces that gap and hands it back to you.
(And that `0.9` labels itself `assumed`, not measured — provenance you can see.)

That's the whole idea in one screen.

<p align="center">
  <a href="https://fatin-ishraq.github.io/ThoughtML/playground/"><strong>▶ &nbsp;Try it live in your browser →</strong></a><br/>
  <sub>the real parser, compiled to WebAssembly — type on the left, watch the reasoning graph build on the right. No install.</sub>
</p>

## Why now

For as long as reasoning has been expensive to produce, it made sense to trust it by
default. That's changing. An AI agent can now emit pages of structured argument at no
cost — which means the scarce, valuable thing is no longer *producing* reasoning but
**auditing** it.

ThoughtML is built for that world. The agent (or you) writes the reasoning down in a
form that's explicit enough to check; a human, another agent, or CI reads it back and
catches where the confidence betrays the structure. The point was never to *compute
the answer.* It's to make reasoning legible enough that its flaws can't hide.

> **Writing ThoughtML with an AI?** [`llms.txt`](llms.txt) is the entire language in
> one self-contained, source-derived file, written for the agent that authors it — the
> closed vocabularies, the distinctions that matter, how to read the mirror back, and
> gold examples. Paste it into a system prompt and the agent writes valid ThoughtML.

## The concepts

- **Typed reasoning.** A focus is an `observation`, `claim`, `hypothesis`, `option`,
  `decision`, `goal`, `assumption`, … — not just a box. Foci nest into *thought-trees*:
  a claim and the reasoning that hangs off it, as one unit.
- **Defeasible evidence.** `supports` / `opposes` / `undercuts` form an argument graph;
  an opt-in grounded status reads every node as `in` / `out` / `undecided`. Purely
  structural relations (`part-of`, `candidate-for`) let you *enumerate* without
  silently inflating confidence.
- **Time is the spine.** Beliefs are dated and ordered by valid-time. They can be
  revised, and a dead end can be `abandoned` — *kept with its reason, not deleted*.
  Redefining a focus never clobbers the first version; both are retained. Replay the
  whole thing as of any instant (`--as-of`, or the viewer's play button). Nothing is
  forgotten.
- **Honest numbers.** One strength encoding — a numeric `weight` — and every authored
  number can declare its basis: `measured` / `estimated` / `assumed`.
- **The mirror.** An opt-in conflict report flags where your structure disagrees with
  what you said: high confidence in a claim your own evidence defeats
  (`confidence-vs-status`), or the same focus defined two incompatible ways
  (`definition-divergence`). It reports; it does not decide.

## What's in the repo

ThoughtML is a *language*; this repo is its **reference implementation**. One parser is
the single source of truth — everything else is that same parser wearing a different
hat, so the browser, the CLI, and the exported file can never disagree.

| Piece | What it is | |
|---|---|---|
| **Reference parser** | Rust: source → surface AST → canonical objects → JSON, with diagnostics. The source of truth for the language. | [`crates/thoughtml`](crates/thoughtml) |
| **CLI toolchain** | The parser as git-style subcommands — `check`, `fmt`, `explain`, `diff` — plus the mirror (`--audit`), the compute layer (`--compute`), as-of replay (`--as-of`), and standalone HTML export (`--html`). | same crate |
| **wasm build** | The *same* parser compiled for the web, so the playground and the CLI can't drift. | [`crates/thoughtml-wasm`](crates/thoughtml-wasm) |
| **Playground** | Live editor + reasoning graph (mermaid.live in spirit): a time-driven **Viewer** with replay and Follow-mode storytelling, a node-link **Structural** view, and one-click standalone-HTML export. | [`web`](web) · [live ↗](https://fatin-ishraq.github.io/ThoughtML/playground/) |
| **The book** | Tutorial, complete language reference, the mirror, and practical guides. | [`docs`](docs) · [live ↗](https://fatin-ishraq.github.io/ThoughtML/) |
| **`llms.txt`** | The whole language in one file, for the AI that authors it. | [`llms.txt`](llms.txt) |
| **Example gallery** | 20 worked, strict-clean documents — an incident triage, a clinical differential, an AI moderation call, a security threat model, a self-auditing hotfix, and more. | [`examples`](examples) |

## Install & run

You don't need any Rust to *use* the language — only to run the reference
implementation.

**Install the CLI.** The quickest way, on any platform with Node:

```sh
npm install -g thoughtml
```

Or, if you have a Rust toolchain:

```sh
cargo install --git https://github.com/Fatin-Ishraq/ThoughtML thoughtml
```

Prebuilt binaries for macOS, Linux, and Windows are attached to every
[release](https://github.com/Fatin-Ishraq/ThoughtML/releases). (A `pip install` is on the way.)

**Run the toolchain** — the bare `thoughtml <file>` still emits the canonical JSON model:

```sh
thoughtml examples/ship-the-hotfix.thml               # canonical JSON + diagnostics
thoughtml --audit examples/ship-the-hotfix.thml       # the mirror: where structure disagrees
thoughtml check --json doc.thml                  # diagnostics with stable codes + suggested fixes
thoughtml fmt -w doc.thml                          # format in the one canonical style
thoughtml explain doc.thml some-claim              # why a node has its confidence / status
thoughtml diff before.thml after.thml              # a semantic, belief-level diff
thoughtml --html -o record.html examples/choose-datastore.thml   # bake to one interactive HTML file
```

Full reference: [The CLI ↗](https://fatin-ishraq.github.io/ThoughtML/guides/cli.html).
Prefer not to install? Run any of it via `cargo run -p thoughtml -- …`, or just open the
[playground](https://fatin-ishraq.github.io/ThoughtML/playground/).

**Hack on the playground locally:**

```sh
cd web && npm install
npm run wasm    # build the parser to wasm (uses the rustup toolchain)
npm run dev
```

## What you'd use it for

- **Decision records (ADRs) you can lint** — the options, the evidence, and the open
  question that blocks sign-off, all checkable.
- **AI-agent reasoning a human or CI can audit** — the agent emits its reasoning; the
  mirror catches where its confidence betrays its own structure.
  ([guide ↗](https://fatin-ishraq.github.io/ThoughtML/guides/for-ai-agents.html))
- **Design & code review of an argument** — surface "you hold this at 0.9, but your own
  listed risk defeats it."
- **Incident postmortems** as checkable causal graphs, and **research / claim maps** with
  provenance on every number.

More in [Use cases ↗](https://fatin-ishraq.github.io/ThoughtML/guides/use-cases.html).

## Status

**v0.2.0** — the toolchain release. Since the 0.1.0 subtraction (a mirror, not an oracle),
`thoughtml` has grown a real toolchain — `check` / `fmt` / `explain` / `diff` — plus a
valid-time memory overhaul (lifecycle, thought-trees, as-of replay), a second conflict type,
and the standalone `--html` viewer. The full trail is in [CHANGELOG.md](CHANGELOG.md); the
language as it stands today is in the [book](https://fatin-ishraq.github.io/ThoughtML/). The
surface may still move — hence 0.x, not 1.0.

## Contributing

Issues and ideas are welcome — open one [here](https://github.com/Fatin-Ishraq/ThoughtML/issues).
The reference parser is the source of truth for the language and the docs are derived from
it, so if the two ever disagree, that's a bug worth reporting.

## License

[MIT](LICENSE) © 2026 Fatin Ishraq.
