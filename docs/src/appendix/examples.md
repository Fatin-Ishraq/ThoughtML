# Example gallery

The reference implementation ships a corpus of ten example documents in
[`examples/`](https://github.com/Fatin-Ishraq/ThoughtML/tree/main/examples).
Every one parses **strict-clean** (zero errors, zero warnings) under default
options and is **`fmt`-clean** — tests enforce both. A curated spine appears in
the playground's example tray; every file can also be opened directly in the
project workspace.

Open any of them in the [playground](../guides/playground.md) to see the graph, or
run `thoughtml <file>` (add `--compute` for the second reading, `--audit` for the
mirror). Ten files is deliberate: few enough to read all of them in a sitting, and
between them they carry a worked instance of every kind, relation, posture, field,
basis, lifecycle state, confidence form, and both mirror conflicts — pinned by a
test, so the claim cannot quietly go stale. The domains are spread on purpose, from
a home kitchen to a wildfire: nothing about the language is specific to software.

The repository also includes a six-file project under `examples/snake-project/`.
Its `project.thml` entry imports product, architecture, gameplay, quality, and
release modules into one graph. Use it to try the multi-file playground,
file/line provenance, live streaming, and inline expansion of imported
conclusions:

```sh
thoughtml stream examples/snake-project/project.thml
```

## Start here

| Example | What it teaches |
|---------|-----------------|
| [`pour-the-slab.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/pour-the-slab.thml) | A clean document the mirror still flags — the `confidence-vs-status` conflict. The flagship demo, and the smallest complete piece of reasoning. |
| [`why-the-loaf-failed.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/why-the-loaf-failed.thml) | An everyday question done properly: `candidate-for` proposes, `answers` resolves, and a ruled-out guess is parked `abandoned` rather than deleted. |

## Arguments and evidence

| Example | What it teaches |
|---------|-----------------|
| [`peer-review.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/peer-review.thml) | `undercuts` (attack an inference — target the link) versus `opposes` (attack a claim), plus the second mirror conflict: two referees write one id two ways and both are kept. |
| [`well-water.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/well-water.thml) | A field investigation as an acyclic `causes`/`enables`/`prevents` graph; a scope whose provenance its members inherit; a weighted evidence bundle. |

## Time and change

| Example | What it teaches |
|---------|-----------------|
| [`dating-the-codex.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/dating-the-codex.thml) | A belief revised as evidence lands; the earlier one `superseded`, not erased. `--as-of` replay makes a conflict disappear, because at that date it did not exist yet. |

## Decisions

| Example | What it teaches |
|---------|-----------------|
| [`grant-panel.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/grant-panel.thml) | One award, four people: criteria collected with `part-of` (not evidence), options weighed, one withdrawn and kept `abandoned`, the award blocked `until` a review answers. |

## The compute layer

| Example | What it teaches |
|---------|-----------------|
| [`orchard-water.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/orchard-water.thml) | A budget that computes itself: `= formula` lines with real dimensional analysis (L/min × min = L, ÷ trees = L/tree, and a subtraction that must match dimensions). |
| [`evacuate-or-shelter.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/evacuate-or-shelter.thml) | The whole compute layer in one decision: a probability borrowed from derived confidence, expected-value ranking, and a what-if that flips it. |

## Dialects and modularity (advanced)

| Example | What it teaches |
|---------|-----------------|
| [`inspection-standards.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/inspection-standards.thml) | A standalone importable library — a `part-of` collection of requirements, and the building block the inspection imports. |
| [`bridge-inspection.thml`](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/examples/bridge-inspection.thml) | `import … as` with namespaced cross-document references, run as a project — plus a `profile` declaring a structural-engineering dialect (`defect`/`remedy` kinds, `aggravates`/`mitigates` relations, a `severity` field, a `certifies` posture). |

## A walkthrough: `pour-the-slab.thml`

The most instructive example is the smallest interesting one:

```thml
focus conditions-are-fine
  kind claim
  Conditions on site are fine to pour the foundation slab this afternoon.

focus truck-is-booked
  kind observation
  The ready-mix truck is booked for 14:00 and the full crew is on site.

focus overnight-freeze
  kind observation
  The site thermometer logged minus four degrees from 02:00 to 06:00, and tonight's
  forecast repeats it. Fresh concrete that freezes before it sets never recovers.

link truck-is-booked supports conditions-are-fine
link overnight-freeze opposes conditions-are-fine

site-engineer holds conditions-are-fine
  confidence 0.88 assumed
  note Pouring today. The truck is booked and the crew moves to another job Thursday.
```

Read it through the mirror:

- **Argument status.** `overnight-freeze` has no attackers → `in`. It `opposes`
  `conditions-are-fine`, so `conditions-are-fine` → `out` (defeated by its own
  recorded counter-evidence, even though a booked truck supports it).
- **Conflict.** The site engineer holds the now-`out` claim at `0.88` (≥ 0.66) → a
  `confidence-vs-status` **error**.
- **Provenance.** That `0.88` is `assumed` — the mirror shows not just how sure the
  engineer is, but on what footing.

The document is structurally clean. The mirror surfaces the contradiction the
*form* can't — and leaves the call to you. That's ThoughtML in one screen.
