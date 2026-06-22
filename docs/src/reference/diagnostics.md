# Diagnostics

Diagnostics are how ThoughtML tells you something's wrong with a document's
*form*. They come in two severities:

- **Error** — the document is malformed. The CLI exits non-zero.
- **Warning** — suspicious but parseable. The CLI still exits zero, unless you
  pass `--strict` (which makes warnings fail too).

Diagnostics go to **stderr**; the JSON model goes to stdout. They are distinct
from the mirror's [conflict report](../mirror/conflicts.md), which judges a
document's *coherence*, not its form, and never fails parsing.

> **The strict-clean invariant.** Every bundled example parses with **zero errors
> and zero warnings** under default options. A test (`bundled_examples_are_strict
> _clean`) enforces it, so the corpus can't silently rot.

## Errors

| Message (abbreviated) | Cause |
|------------------------|-------|
| `tab indentation is invalid; v0 requires spaces` | a tab in leading whitespace |
| `indented block line before any record header` | a block line with no open record |
| `<kw> header expects exactly one identifier` | malformed `focus`/`scope`/`question`/`profile` header |
| `link header expects [alias:] from relation to` | wrong link arity |
| `stance header expects [alias:] agent posture target` | wrong stance arity |
| `import header expects import <name> as <namespace>` | malformed import |
| `unknown record kind or header …` | first token isn't a keyword, second isn't a posture |
| `<posture> action expects a single target identifier` | wrong arity for a simple action |
| `suspects expects from relation to [as alias]` | malformed `suspects` |
| `infers expects target from id-list` / `requires at least one source` | malformed `infers` |
| `invalid identifier/symbol … (expected lowercase kebab-case)` | bad token |
| `confidence must be a number, range, or ?` | non-numeric confidence |
| `confidence range must be ordered low..high` | reversed range |
| `weight/probability must be a number in 0..1` | non-numeric weight/probability |
| `link.from/to … targets a <kind>; links may only connect foci, questions, or links` | a link pointing at a stance or scope |

## Warnings

**Indentation & structure**

- `block lines should be indented by two or more spaces`
- `only a scope may contain nested objects; desugaring them at the top level`

**Ids & kinds**

- `duplicate id` / `id is reused across records`
- `focus … was declared as kind X but redeclared as Y; keeping X`
- `duplicate <field> field; using the last` (kind, confidence, weight, probability, expects, status, formula)
- `unknown focus kind` / `unknown posture` / `unknown relation` / `unknown field` (unless a [profile](modules.md) declares it)

**Values**

- `quantity should be <number> <unit>`
- `weight/probability should be in 0..1; clamping`
- `probability on a <rel> link is ignored` / `a weight on a leads-to link is ignored`
- `kind requires a value` / `until requires a reference`
- `question should include body text or an expects field` / `about expects one or more ids`

**Reference resolution**

- `… is an unresolved reference` (link endpoints, stance targets, `about`, `because`/`answers`/`blocked-by`/`undercut-by`, formula refs)

**Semantic lints** (need the whole graph)

- `agent … takes contradictory stances on …` — incompatible posture pairs:
  `accepts`/`rejects`, `accepts`/`doubts`, `chooses`/`rejects`, `holds`/`rejects`.
- `cyclic dependency: a → b → a` — a cycle among `causes` / `depends-on` edges.
- `focus … is not connected to anything` — an **orphan**: nothing links it, no
  stance targets it, no field references it.

**Decision graph**

- `leads-to edge … points outcome … at itself`
- `option … has no leads-to outcomes, but its sibling options do` — it'd be
  silently missing from the EV ranking.

**Temporal**

- `… revises … but is asserted earlier`
- `valid-during … ends before it starts`

**Compute** (only with the relevant opt-in flags)

- formula: parse error, unresolved/quantity-less reference, dimension mismatch,
  dependency cycle.
- decision EV: missing probability/payoff, mixed dimensions, probability mass > 1.

**Provenance** (only with `--strict-provenance`)

- `… declares no basis (add measured/estimated/assumed)`

**Imports**

- `unknown import …` / `import cycle through …; skipped`
