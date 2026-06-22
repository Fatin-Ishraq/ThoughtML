# Introduction

ThoughtML is a plain-text language for **reasoning you can check**.

You write down what you believe and why — claims, evidence, who holds what, how
confident, as of when — and ThoughtML reads it back as a typed, dated,
defeasible graph. A second, mechanical reading can then tell you where your own
structure disagrees with what you said.

ThoughtML is a **mirror, not an oracle**: it shows you the conflict; it does not
make the call.

## A first taste

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
evidence (`stale-reads opposes cache-is-safe`) defeats that claim. It wrote
down the counter-observation, then shipped anyway. ThoughtML surfaces that
disagreement; it doesn't decide for you. (And the `0.9` declares its basis —
`assumed`, not measured — provenance you can see.)

## Why it exists

Prose hides the shape of an argument. A bullet list flattens it. ThoughtML keeps
the shape: every claim is typed, every link has a direction and a meaning,
beliefs carry confidence and a date, and evidence can be defeated by other
evidence. Because the structure is explicit, a machine can read it a *second*
way — and where the two readings disagree, that gap is worth your attention.

It's built for an age where an AI agent can emit this structure at no cost, and a
human (or another agent, or CI) audits it. The point isn't to *compute the
answer*. It's to make the reasoning legible enough that its flaws can't hide.

## How this book is organized

- **[Getting Started](getting-started/installation.md)** — install the parser,
  run the playground, write your first document.
- **[Tutorial](tutorial/index.md)** — learn the language step by step, building
  one document up from a single focus to a full audited argument.
- **[Language Reference](reference/index.md)** — the authoritative description
  of every record, relation, posture, field, and diagnostic.
- **[The Mirror](mirror/index.md)** — the opt-in evaluation layer: derived
  confidence, argument status, conflict reports, and the compute layer.
- **[Guides](guides/use-cases.md)** — when to reach for ThoughtML, how to drive
  it from an AI agent, the CLI, and the playground.
- **[Appendix](appendix/glossary.md)** — glossary, example gallery, FAQ.

## A note on stability

This documentation describes **v0.1.0**, the first public release. The language
is real and usable, but its surface may still move (hence 0.x, not 1.0). Where a
feature is *opt-in* or *advanced*, this book says so plainly.

> **The single source of truth is the reference parser** in
> `crates/thoughtml`. Everything in this book is derived from it. If
> the two ever disagree, the parser wins — and that's a documentation bug worth
> [reporting](https://github.com/Fatin-Ishraq/ThoughtML/issues).
