# Language Reference

This is the authoritative description of ThoughtML as of **v0.1.0**. It is
derived from the reference parser; where this book and the parser disagree, the
parser is correct.

## The pipeline

Every ThoughtML document goes through the same stages, in both the CLI and the
(wasm-compiled) playground:

```
source text
  → lines        classify each line: blank, comment, header, block
  → surface AST  parse headers and fields into records
  → canonical    desugar the readable surface into normalized objects
  → validate     resolve references; run semantic lints
  → derive       (opt-in) the mirror's second readings
  → canonical JSON
```

The **canonical object model** is the interchange form — a flat, ordered array of
typed objects. Everything downstream (the graph, the mirror, any other tool)
reads canonical objects, not source text.

## Two surfaces, one model

ThoughtML has two ways to write the same thing:

- The **canonical core** — `focus`, `link`, `stance`, `question`, `scope` records
  written directly.
- The **readable action surface** — `<agent> <posture> <target>` lines that
  *desugar* into the core (creating foci, links, and stances for you).

They produce the same objects. The bundled
[`canonical-core.thml`](../appendix/examples.md) writes the same reasoning as
[`multi-agent-debate.thml`](../appendix/examples.md) using the bare core, to show
the equivalence.

## How to read these pages

- **[Lexical structure](syntax.md)** — lines, indentation, comments, value types.
- **[Records and the canonical model](records.md)** — the seven object types and
  their JSON shape.
- **[Foci and kinds](foci-and-kinds.md)**, **[Links and relations](relations.md)**,
  **[Stances and postures](postures.md)**, **[Questions](questions.md)** — the
  primitives in detail.
- **[Fields](fields.md)** — every known field and where it attaches.
- **[Scopes](scopes.md)** and **[Profiles, imports, namespaces](modules.md)** —
  structure and modularity.
- **[Numbers, units, provenance](numbers.md)** — the value model.
- **[Diagnostics](diagnostics.md)** — every error and warning, and what triggers
  it.
