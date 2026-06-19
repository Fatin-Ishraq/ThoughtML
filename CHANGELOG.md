# Changelog

All notable changes to ThoughtML are recorded here. The project follows
[Semantic Versioning](https://semver.org). **v0.1.0** is the first public
release — real and usable, but the surface may still move.

## [0.1.0] — 2026-06-19

The first release is a *subtraction*. ThoughtML had been built up across many
phases — typed reasoning, defeasible evidence, temporal revision, an opt-in
compute layer — and v0.1.0 deliberately cuts it back to its spine: a **mirror
that shows the conflict, not an oracle that hands down a verdict**.

### Removed

- **Oracle outputs.** A decision no longer reports a `best` option or a `margin`.
  The engine still orders options by expected value as a *second reading*, but it
  crowns no winner — the choice stays with the reader.
- **Redundant relations.** `rejects` and `mitigates` are gone; both merely
  duplicated `opposes`. A hard rejection is `opposes`; defending X is attacking
  X's attacker (`guard opposes risk`), reinstated uniformly by the grounded
  status. The core relation set is down from 14 to 12.
- **Strength adverbs.** `strongly` / `weakly` are gone. Each smuggled in a magic
  number (0.85 / 0.30) the author never chose. Strength is now expressed by the
  single, explicit numeric `weight` field.

### Changed

- **The compute layer is no longer framed as "executable."** Quantities,
  formulas, and expected value remain — opt-in and off by default — but as a
  *second reading* of the author's numbers, not a program the document runs.
- **Profiles, imports, and namespaces are now advanced/optional.** They remain
  implemented and tested, just out of the core story. (The README had wrongly
  listed them as "not yet implemented" — they shipped on the v0.2 track.)
- **The playground is curated to a spine** of ten examples and two lenses
  (Type, Argument). The compute and multi-document demos, and the
  Evidence/Load/Decision lenses, are parked — not deleted.

### Added

- **Number provenance.** An authored number may declare its basis inline:
  `measured` / `estimated` / `assumed` — e.g. `confidence 0.9 assumed`,
  `quantity 30 GB measured`, `weight 0.85 measured`. Optional and non-breaking;
  an opt-in `--strict-provenance` lint flags numbers that omit it. This closes
  the gap the strength adverbs left: a number no longer passes as fact without
  saying on what footing it stands.

### Notes

- The reference parser ships with 171 passing tests; every bundled example is
  strict-clean (zero errors **and** zero warnings) under default options.
- Opt-in derived fields stay off by default for stable CLI output; the
  playground turns them on.

## Earlier (pre-0.1.0, v0.2 development track)

Before the subtraction, the language was built up in phases: typed foci and
relations; defeasible evidence with derived confidence; grounded argument
status; temporal assertion and revision (as-of views); a
quantities / formulas / expected-value compute layer; nested scopes, profiles,
and imports with namespaces; and the first mirror output — an opt-in conflict
report (`confidence-vs-status`). See `project_plan.md` for the full development
history (note: some of its phase notes describe features this release removed).
