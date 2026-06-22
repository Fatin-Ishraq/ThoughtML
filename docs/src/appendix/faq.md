# FAQ

### Is ThoughtML a programming language?

It's a language for *representing reasoning*, not for computing. You don't run a
ThoughtML document to produce a result; you write down a structured argument and
the tooling reads it back — typed, dated, checkable. The opt-in
[compute layer](../mirror/compute.md) evaluates the numbers you authored, but
that's a *reading* of your reasoning, not a program it executes.

### How is it different from a mind map or a bullet list?

A bullet list flattens structure; a mind map captures connection but not
*meaning*. ThoughtML keeps both: every link has a typed relation and a direction,
every belief a holder and a confidence, evidence can be *defeated* by other
evidence, and beliefs are dated. Because the structure is explicit and typed, a
machine can read it a second way — which a mind map can't offer.

### What does "a mirror, not an oracle" mean?

The engine produces a second, mechanical reading of your structure and tells you
where it disagrees with what you wrote — but it never overrules you or decides for
you. It surfaces the conflict; you resolve it. See [The Mirror](../mirror/index.md).

### Why is everything opt-in and off by default?

Two reasons. A document with no derivations serializes identically every time,
which keeps output stable and diffable in CI. And it enforces the discipline that
*computed values never overwrite authored ones* — each derived field lives beside
what you wrote, never on top of it.

### Do I have to write `focus` / `link` / `stance`?

No — that's the canonical core, and you can write it directly. Most of the time
you'll use the readable surface (`analyst noticed metric-shift`,
`team chooses postgres-option`), which desugars into the core for you. They
produce the same model; [`canonical-core.thml`](examples.md) shows the equivalence.

### Why did `rejects`, `mitigates`, and `strongly`/`weakly` disappear?

v0.1.0 was a deliberate *subtraction*. `rejects` and `mitigates` as relations only
duplicated `opposes`; the strength adverbs each smuggled in a magic number the
author never chose. They were removed to keep one honest way to say each thing.
(`rejects` still exists as a *posture*.) See the project
[CHANGELOG](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/CHANGELOG.md).

### Is the compute layer gone, then?

No — quantities, formulas, expected value, and sensitivity all still ship,
behind opt-in flags (`--formulas`, `--decisions`, `--sensitivity`, or `--compute`
for all). v0.1.0 reframed them as an opt-in *second reading*, not as the language's
headline. See [The compute layer](../mirror/compute.md).

### Can an AI agent write ThoughtML?

That's a primary design goal. The grammar is small and regular, so an LLM can emit
it reliably, and the [mirror](../mirror/conflicts.md) lets a human or CI audit the
result. See [ThoughtML for AI agents](../guides/for-ai-agents.md).

### Is the syntax stable?

It's **v0.1.0** — real and usable, but the surface may still move (hence 0.x).
Breaking changes will be recorded in the
[CHANGELOG](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/CHANGELOG.md).

### Where's the formal specification?

The single source of truth is the **reference parser** in
`tools/thoughtml-parser-rs`. This documentation is derived from it: if the two
ever disagree, the parser wins (and that's a documentation bug worth reporting).
There is no separate formal grammar document — this book *is* the specification,
kept honest against the parser.

### How do I report a bug or a documentation error?

Open an issue at
[github.com/Fatin-Ishraq/ThoughtML/issues](https://github.com/Fatin-Ishraq/ThoughtML/issues).
If this book and the parser disagree, that's a documentation bug worth filing.
