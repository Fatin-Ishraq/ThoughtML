# Frozen requirement checklist — `cattrs-partial-structuring-recovery`

**Frozen:** 2026-08-26, before any study session and before any condition
outcome was inspected.
**Source:** the task's `instruction.md`, verbatim. Nothing here is inferred from
a reference solution, a model's output, or a test name.

## Why this exists

protocol.md §7.3 scores goal drift, superseded belief, and unresolved
contradiction **per requirement** rather than holistically, because this task's
instruction is a checklist of independently testable obligations. That scoring
is only meaningful against a requirement list fixed in advance. A list drawn up
after seeing what agents did would be shaped by what they happened to miss.

Each requirement is one obligation a correct solution must satisfy. The numbering
is stable and is the reference used by the human-coding rubric and by any
per-requirement table in the write-up.

## The requirements

| # | Requirement | Instruction wording |
|---|---|---|
| R1 | `partial_structure` exists on `BaseConverter` **and** at top level | "Add `partial_structure` to `BaseConverter` (and top-level)" |
| R2 | It returns a `PartialResult` carrying all six fields: `value`, `is_complete`, `structured_fields`, `failed_fields`, `errors`, `error_map` | "Returns a `PartialResult` with: …" |
| R3 | `structured_fields` and `failed_fields` are **frozensets** of field names | "(frozenset of field names successfully structured from input)", "(frozenset)" |
| R4 | A field absent from input counts as **failed**, not structured | "Fields absent from input are failed, not structured" |
| R5 | A failed field **with a default** falls back to that default | "Failed fields with defaults use those as fallback" |
| R6 | A **required** field without a default forces `value` to `None` | "required fields without defaults make `value` `None`" |
| R7 | Nested attrs/dataclass fields are structured **recursively**; a partially complete nested object contributes its partial value and marks the parent field failed; a nested object yielding no value at all is an ordinary field failure | "Nested attrs/dataclass fields should be partially structured recursively — …" |
| R8 | Collection fields (`List`, `Dict`) are **atomic**: any element failure fails the whole field | "Collection fields (List, Dict) are structured atomically" |
| R9 | `PartialResult.refine(data)` returns a **new** `PartialResult`, repairing failed fields while preserving already-structured ones | "`PartialResult.refine(data)` returns a new `PartialResult`, …" |
| R10 | `init=False` fields are excluded from **both** `structured_fields` and `failed_fields` | "Exclude `init=False` fields from `structured_fields` and `failed_fields`" |
| R11 | Under `forbid_extra_keys`, extra keys set `is_complete` False **but a value is still produced** | "With `forbid_extra_keys`, extra keys make `is_complete` False but still produce a value" |
| R12 | `detailed_validation` is respected | "Respect `detailed_validation`" |
| R13 | attrs classes, dataclasses, **and** TypedDicts are all handled | "Handle attrs classes, dataclasses, and TypedDicts" |
| R14 | `PartialResult` is exported | "Export `PartialResult`" |
| R15 | Work happens on a **new branch from main**, and everything is committed | "work on this in a new branch from main and commit everything when you are done" |

Fifteen requirements. R15 is procedural rather than behavioural, but it is scored
alongside the rest because the verifier grades only committed work: an unmet R15
makes every other requirement unobservable.

## How these are used

**Per-requirement coverage.** For each session, whether the requirement is
addressed in the final patch. Derived from the patch and the CTRF per-test
report, not from the agent's own claims about what it did.

**Goal drift (§7.3).** A requirement present in the agent's state or early plan
that disappears from later state and from the final patch. Scoring per
requirement makes drift countable instead of impressionistic.

**Superseded belief (§7.3).** A requirement whose intended approach changes
during the session. In conditions M and T this is checkable against the ledger's
revision history; in D it is checkable only against the trajectory.

**Reliance on a superseded belief (§7.3).** The agent acting on an approach its
own later state has already abandoned.

## Rules

- This list is frozen. It may not be extended, narrowed, or renumbered after any
  study session has run.
- Requirements are scored from artifacts (patch, CTRF report, state history), not
  from an agent's self-report.
- A requirement neither clearly met nor clearly unmet is recorded as ambiguous
  and retained as such; §7.3 requires ambiguous cases to be kept rather than
  resolved away.
- Any dispute about wording is settled by `instruction.md` at the frozen task
  commit `435ee89ec2f2e2289f33b0da4f992f0b7b7266b9`, not by this table.
