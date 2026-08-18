# Stability and compatibility

ThoughtML is at **0.x**: the surface may still move. This document states what
**1.0** would freeze, so the promise is specific enough to keep and narrow enough
to leave room for the work that is still open.

It is written before 1.0 deliberately. A compatibility promise decided at release
time is a promise nobody has tested.

## The four surfaces

They are separable, and they are not equally rigid.

| Surface | What it is | Under 1.0 |
|---|---|---|
| **The language** | The closed sets: 10 kinds, 14 relations, 12 postures, the known fields, 3 bases, 4 lifecycle states | **Frozen.** A document that parses strict-clean under 1.0 parses strict-clean under every 1.x. |
| **The canonical model** | The JSON `thoughtml <file>` emits | **Additive only.** Existing fields keep their name, type, and meaning. New fields may appear in a minor release. |
| **The CLI** | Commands, flags, exit codes, `TML` diagnostic codes | **Additive only.** No flag is removed or repurposed; no code is reassigned. |
| **The Rust API** | The `thoughtml` crate's public items | **Semver as normal.** This is the one surface where a 2.0 is a routine event. |

## What "frozen" means for the language

Concretely, across all of 1.x:

- **No word is removed or repurposed.** `supports` will always mean evidence-for.
- **New vocabulary is additive and minor-versioned.** A new relation may appear in
  1.1; documents written for 1.0 keep working, and documents using it simply
  require 1.1.
- **Time stays optional.** A document with no dates in it is valid, is not
  second-class, and never becomes invalid. This one is called out because the
  time model is the part of the language most likely to grow (see below).
- **Strict-clean is monotonic in one direction only.** A 1.x release may stop
  warning about something. It will not start warning about a construct that was
  clean in 1.0 — that would break the gate every authoring loop depends on.

The last point is the sharpest, because it is the one a well-meaning improvement
breaks by accident. New diagnostics land in a major version, or as an opt-in flag
(the way `--strict-provenance` and `--lint` already work).

## What is deliberately *not* frozen

- **Derived numbers.** `derived_confidence`, `leverage`, expected values, and the
  grounded `argument_status` are *computed readings*, not authored data. The
  algorithms may be refined within 1.x, and a refinement can move a number. What
  is frozen is that they are opt-in (`--compute` and friends), that they never
  alter the authored model, and that their shape in the JSON stays stable.
- **Formatting.** `thoughtml fmt` may change its canonical style in a minor
  release. It re-parses its own output and verifies the model is unchanged, so a
  style change can never change meaning — but it may change bytes, which is why
  `fmt --check` belongs in CI rather than in a compatibility promise.
- **The rendered viewer and the playground.** Presentation, not interchange.

## The two open language questions, and why they survive the freeze

Both were checked against this policy before it was written, because a promise
that blocks the roadmap is the wrong promise.

**Time as the spine, not a side-feature.** Everything this needs is additive: a
richer timeline projection, new derived fields, new replay flags. It stays
non-breaking *provided* dateless documents remain valid and `--as-of` keeps its
current meaning. Both are pinned above. What would break 1.x is making timestamps
mandatory or redefining what `--as-of` selects; if either becomes necessary, it is
a 2.0, and this document is the reason that will be obvious in advance rather than
discovered afterwards.

**Forgetting — principled compaction of settled reasoning.** This is a new
operation over an existing model: a command that reads a document and writes a
smaller one. It adds no vocabulary and changes no parse. Fully compatible.

## What is checked, not just asserted

A policy nothing enforces is a wish. These run in CI:

- **`vocabulary_is_frozen`** — pins every closed set element by name. Removing or
  renaming one fails the build; adding one fails it too, so the addition has to be
  a deliberate edit to the test rather than a side effect.
- **`the_corpus_model_is_stable`** — snapshots the canonical JSON of every bundled
  example. Any change to the model shows up as a diff in review, which is the
  point: model changes should be arguments, not accidents.
- **`every_documented_snippet_parses`** — the book cannot teach syntax the parser
  rejects.
- **The corpus job** — all ten examples stay strict-clean, lint-clean, and
  canonically formatted on every push.

## Reporting

Compatibility breaks are bugs. Security issues follow [SECURITY.md](SECURITY.md).
