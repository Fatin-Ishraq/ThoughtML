# Tutorial

This tutorial teaches the language by building **one real document** up from a
single line to a complete argument the [mirror](../mirror/index.md) can audit.

The scenario: an engineering team is deciding whether to ship a new cache layer
today. By the end you'll have written the bundled example
[`self-audit.thml`](../appendix/examples.md) — a document that is *diagnostically
clean* yet hides a real contradiction, which the mirror surfaces.

The chapters build on each other:

1. **[Foci](foci.md)** — name the things you're reasoning about.
2. **[Links](links.md)** — connect them with typed, directed relations.
3. **[Stances](stances.md)** — record who believes what, and how.
4. **[Questions](questions.md)** — mark what's still open and what it blocks.
5. **[Numbers](numbers.md)** — confidence, weight, and where numbers come from.
6. **[Time and revision](time.md)** — date beliefs and let them change.
7. **[The mirror](the-mirror.md)** — read your structure back and find the conflict.

Each chapter is short. Type the examples into a file and run them with
`thoughtml <file>.thml` (see [Installation](../getting-started/installation.md)),
or paste them into the [playground](../guides/playground.md) to see the graph.

> **Conventions.** Identifiers are lowercase kebab-case (`cache-is-safe`).
> Indentation is **two spaces** — tabs are an error. A `#` starts a comment line.
