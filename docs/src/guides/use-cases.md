# Use cases

ThoughtML earns its keep wherever **the reasoning matters as much as the
conclusion** — where someone later needs to check *why*, not just *what*. Here are
the concrete situations it's built for.

## 1. Decision records you can lint

An architecture decision record (ADR) is usually prose: "we chose Postgres
because…". Written as ThoughtML, the ADR *is* a graph — options considered, the
evidence for and against each, the question that blocks sign-off, the choice and
its justification. Now it's checkable: did you actually reject the alternatives
for stated reasons? Is the decision still blocked on an open question?

See [`decision-record.thml`](../appendix/examples.md).

## 2. AI agent reasoning a human (or CI) can audit

This is the headline use case. An AI agent makes a call — what to ship, which fix
to apply, how to triage. Instead of a paragraph of justification, it emits a
ThoughtML document: the claim, the evidence it weighed, its confidence, and the
basis of each number. A human, another agent, or a CI step then runs the
[mirror](../mirror/index.md) over it and catches the tells: high confidence in a
defeated claim, numbers marked `assumed` where they should be `measured`,
dangling assumptions.

The agent does the reasoning; ThoughtML makes it *legible enough to check*. See
[ThoughtML for AI agents](for-ai-agents.md).

## 3. Design and code review of an argument

Reviewing a proposal often means reviewing an *argument*, and arguments hide
their flaws in prose. A ThoughtML version surfaces them: the
[`confidence-vs-status`](../mirror/conflicts.md) conflict catches "you hold this
at 0.9, but your own listed risk defeats it" — the exact thing a reviewer is
trying to notice and often misses.

The canonical demo is [`self-audit.thml`](../appendix/examples.md).

## 4. Incident postmortems / root-cause analysis

A postmortem is a causal story under uncertainty: a metric shifted, a deploy is
*suspected* to have caused it, evidence accumulates, a fix is chosen but blocked
on a benchmark. ThoughtML keeps the causal links, the suspicion (with a
confidence *range*, honestly), and the blockers explicit — and flags impossible
causal cycles.

See [`incident-742.thml`](../appendix/examples.md).

## 5. Research and claim mapping with provenance

Mapping a contested question — does X cause Y? — means tracking claims, the
evidence weight behind each, who holds what, and where the numbers came from.
ThoughtML's [provenance basis](../reference/numbers.md#provenance) and graded
[weights](../reference/relations.md) make a literature map you can interrogate,
not just read.

See [`ai-and-jobs.thml`](../appendix/examples.md).

## 6. High-stakes personal decisions

Not everything is engineering. A big personal choice — which job, which school —
has goals, evidence, options with uncertain payoffs, and a downside you'd rather
not face. Writing it out as ThoughtML forces the structure into the open and lets
you compare options by [expected value](../mirror/compute.md) without pretending
the number decides for you.

See [`why-harvard.thml`](../appendix/examples.md).

## When *not* to reach for it

- For a quick note with no argument structure, prose is fine.
- For hard numeric modelling, use a spreadsheet or real code — ThoughtML's
  compute layer is a *reading* of your numbers, not a computation engine.
- For a decision nobody will ever need to re-examine, the overhead isn't worth
  it.

The common thread in every *good* fit: **the reasoning will be revisited, by
someone who needs to trust it.**
