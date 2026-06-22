# ThoughtML for AI agents

ThoughtML is designed for an age where **an AI agent can emit reasoning structure
at no cost, and a human (or another agent, or CI) audits it.** This guide is about
that workflow.

## Why a language, and why this one

When an agent explains a decision in prose, the explanation is unstructured: you
can read it, but you can't *check* it mechanically. ThoughtML gives the agent a
target format that is:

- **Cheap to emit.** It's plain text with a small, regular grammar. An LLM can
  produce it reliably.
- **Typed and explicit.** Every claim has a kind, every link a direction and
  meaning, every belief a confidence and (optionally) a basis. Nothing important
  is implied.
- **Auditable.** Once it's structure, the [mirror](../mirror/index.md) can read
  it a second way and flag where the agent's own structure betrays its stated
  confidence.

The point is not to have the agent *compute* the answer in ThoughtML. It's to make
the agent's reasoning **legible enough that its flaws can't hide.**

## The author/auditor loop

```
agent reasons → emits .thml → mirror reads it back → conflicts surface → human/agent resolves
```

A concrete version:

1. An agent decides to ship a change and writes a ThoughtML document: the claim
   (`cache-is-safe`), the evidence it weighed, its confidence, and the basis of
   each number.
2. CI runs `thoughtml --audit` (and maybe `--strict-provenance`).
3. The [conflict report](../mirror/conflicts.md) catches that the agent held a
   claim at 0.9 that its own recorded counter-evidence defeats.
4. A human looks at exactly that one disagreement — not the whole paragraph.

## Practical tips for generating ThoughtML

- **Declare foci with explicit `kind`s.** It makes the graph readable and lets
  the kind-mismatch lint catch category errors.
- **Use confidence ranges for genuine uncertainty** (`0.45..0.70`) rather than a
  false-precision point estimate.
- **Always set a [provenance basis](../reference/numbers.md#provenance).** This is
  the single most valuable habit for an agent: a `0.9 assumed` is honest in a way
  a bare `0.9` is not. Run CI with `--strict-provenance` to enforce it.
- **Record the counter-evidence.** The mirror can only catch a
  `confidence-vs-status` conflict if the opposing observation is *in the
  document*. An agent that writes down what argues against its own conclusion gets
  the most value.
- **Keep computed and authored numbers separate** — which the language does for
  you: never put a derived value in an authored field.

## In CI

A minimal gate for agent-authored documents:

```sh
# fail on malformed structure (warnings included) and missing provenance
thoughtml --strict --strict-provenance reasoning.thml > model.json

# inspect the conflict report
thoughtml --audit reasoning.thml | jq '.audit.conflicts'
```

A non-empty `confidence-vs-status` error is a signal worth a human's attention:
the agent believed something its own structure defeats.

See [`agent-memory.thml`](../appendix/examples.md) for an agent's evolving memory
of a user, and [`self-audit.thml`](../appendix/examples.md) for the audit in
action.
