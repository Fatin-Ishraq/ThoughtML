# 3. Stances — who believes what

Foci and links describe the *content* of an argument. A **stance** records an
*agent's relationship to it* — who holds, doubts, chooses, or rejects something,
and how confidently.

The readable form is `<agent> <posture> <target>`:

```thml
ops-agent holds cache-is-safe
  confidence 0.9
  note Shipping — the load test passed.
```

This says the agent `ops-agent` **holds** the focus `cache-is-safe`, at
confidence `0.9`, with a `note` recording the rationale. (`confidence` and `note`
are covered fully in [chapter 5](numbers.md) — for now, just know they ride on
the stance.)

## Postures

A *posture* is the verb. There are twelve:

| Posture | Meaning |
|---------|---------|
| `noticed` | Registered an observation |
| `considers` | Put an option on the table |
| `suspects` | Proposed a tentative link (a hypothesis) |
| `infers` | Drew a conclusion from sources |
| `asks` | Raised a question |
| `holds` | Commits to / believes |
| `chooses` | Selected an option |
| `rejects` | Ruled something out |
| `revises` | Replaced a previous stance |
| `remembers` | Carried a fact forward |
| `doubts` | Holds with low credence |
| `accepts` | Agrees with |

## Some postures create foci for you

Five postures bring a new focus into being and infer its kind, so you don't have
to declare it separately:

| Posture | Creates a focus of kind |
|---------|--------------------------|
| `noticed` | `observation` |
| `considers` | `option` |
| `holds` / `chooses` | `decision` |
| `remembers` | `memory` |
| `infers` | `claim` |

So this:

```thml
analyst noticed metric-shift
  Activation rose after the deploy.
```

creates the focus `metric-shift` (kind `observation`) **and** a stance
(`analyst noticed metric-shift`) in one line. If a focus already exists with an
explicit `kind`, that kind wins — a posture's inferred kind never overrides one
you stated outright.

The other postures (`doubts`, `accepts`, `asks`, `rejects`, `revises`) reference
an existing target rather than creating one.

## Two postures take a richer form

- **`suspects`** proposes a link *and* takes a stance on it:

  ```thml
  analyst suspects ai-automation causes job-displacement as displacement-hypothesis
    confidence 0.45..0.70
  ```

  This creates the two foci, a `causes` link aliased `displacement-hypothesis`,
  and a stance in which the analyst suspects that link. (Note the confidence is a
  *range* — see [chapter 5](numbers.md).)

- **`infers`** draws a conclusion from one or more sources, wiring a `supports`
  link from each:

  ```thml
  analyst infers adaptation-too-slow from ai-capability-surge, reskilling-lag
    confidence 0.60
  ```

## `note` vs. body

For a posture that *creates* a focus, the indented prose becomes that focus's
body. For one that doesn't, the prose becomes a `note` on the stance. Either way,
an explicit `note` field always attaches to the stance — so even `holds` and
`chooses` can carry rationale on the stance itself.

## Multiple agents

Different agents can take different stances on the same target — that's how you
record a disagreement:

```thml
worker accepts displacement-hypothesis
  confidence 0.80
economist doubts displacement-hypothesis
  confidence 0.35
```

If *one* agent takes contradictory postures on the same target (e.g. `accepts`
and `rejects`), ThoughtML warns — see [Diagnostics](../reference/diagnostics.md).

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

link load-test-passed supports cache-is-safe
link stale-reads opposes cache-is-safe

ops-agent holds cache-is-safe
  confidence 0.9
  note Shipping — the load test passed.
```

This is already a complete, meaningful document. Before we hand it to the mirror,
two more building blocks: [questions](questions.md) and [numbers](numbers.md).
