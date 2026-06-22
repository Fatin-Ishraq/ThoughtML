# Scopes

A **scope** groups related records and can cascade context onto them.

```thml
scope incident-742
  source on-call-log
  observed-at 2026-06-17

  focus metric-shift
    Activation rose after the deploy.

  analyst noticed metric-shift
```

## Membership by nesting

Records written **indented inside** a scope become its members. The scope's
`includes` array lists their ids, in order. Nesting is the *only* place
indentation changes meaning: outside a scope, an indented header is unusual and
warns (it's still desugared, at the top level, so nothing is lost).

Scopes nest to any depth:

```thml
scope college-choice
  scope what-i-want
    focus goal-research
      kind goal
      Do undergraduate research with leading faculty.
  scope the-decision
    focus where-to-go
      kind decision
      Which offer do I commit to?
```

The bundled [`why-harvard.thml`](../appendix/examples.md) uses four sub-scopes
(goals / evidence / decision / second-thoughts) to organize a real decision.

## Inheritance

A scope cascades four context fields onto every member that doesn't set its own:
`asserted-at`, `observed-at`, `source`, `valid-during`. The rule is
**member-wins** — a member's own value is never overwritten — and **innermost
wins**, so a sub-scope's default overrides an outer scope's.

This means you can stamp an entire investigation with one date and source at the
top, and only override where a specific record differs:

```thml
scope launch-readiness
  asserted-at 2026-06-01        # every member inherits this date…
  analyst suspects early-burndown causes on-track
    asserted-at 2026-06-01
  analyst revises on-track
    asserted-at 2026-06-08      # …except where one says otherwise
```

## Scopes are not link endpoints

A scope is organizational. Links and stances can't target a scope — only foci,
questions, and links are valid endpoints. Use a scope to *group*, not to *relate*.
