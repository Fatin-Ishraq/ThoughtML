# 1. Foci — the things you reason about

A **focus** is the basic unit of a ThoughtML document: a thing you're reasoning
about. An observation, a claim, an option, a goal — anything you might later
support, attack, question, or believe.

You declare one with the `focus` keyword and an id, then add prose on the next
indented line:

```thml
focus cache-is-safe
  The new cache layer is safe to ship today.
```

The id (`cache-is-safe`) is how everything else in the document refers to this
focus. The indented sentence is its **body** — free text, for humans.

## Kinds

A focus has a *kind* — its semantic category. You set it with a `kind` field:

```thml
focus cache-is-safe
  kind claim
  The new cache layer is safe to ship today.

focus load-test-passed
  kind observation
  Load test at 2x peak traffic passed with no errors.
```

There are ten kinds:

| Kind | What it is |
|------|------------|
| `observation` | Something seen or measured |
| `claim` | An assertion put forward as true |
| `hypothesis` | A proposed explanation, not yet settled |
| `option` | A choice on the table |
| `decision` | A choice to be made (or made) |
| `outcome` | A result an option can lead to |
| `goal` | Something you want |
| `assumption` | Something taken as given |
| `memory` | A recollection carried forward |
| `action` | Something you *do* — a plan, intervention, mitigation |

Kinds are optional but recommended: they make the graph readable at a glance
(the playground gives each kind its own node shape) and they let the language
catch category mistakes.

## You don't always write `focus`

Most of the time you won't declare foci with the bare `focus` keyword. The
readable [posture](stances.md) syntax creates them for you, inferring the kind:

```thml
analyst noticed load-test-passed
  Load test at 2x peak traffic passed with no errors.
```

`noticed` creates the focus `load-test-passed` *and* gives it the kind
`observation` automatically. You'll meet the full set of postures in
[chapter 3](stances.md). For now, the rule of thumb: declare a focus explicitly
with `focus` when you want to set its kind precisely or when several agents will
refer to it; let a posture create it when it belongs to one agent's action.

## Our document so far

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
```

Three foci, no connections yet. Right now ThoughtML will warn that they're
**orphans** — nothing relates them. We fix that next, with [links](links.md).
