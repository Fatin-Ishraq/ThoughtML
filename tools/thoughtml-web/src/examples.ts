// Bundled example sources, mirroring tools/thoughtml-parser-rs/examples/*.thml.
// Embedded as strings so the playground is fully self-contained.

export const EXAMPLES: Record<string, string> = {
  'ai-and-jobs': `# How AI could destroy jobs — a debate you can read straight from the graph.
# Click any node: every focus, link, and stance explains itself.

scope ai-and-jobs

# --- What we observe ---

focus ai-capability-surge
  AI now drafts, codes, and analyzes work that recently needed skilled people,
  and it is improving faster than any prior wave of automation.
  source uri:https://example.org/ai-capability-index
  observed-at 2026-06-17

analyst noticed ai-capability-surge

# --- The central hypothesis ---

focus ai-automation
  Using AI to do whole tasks end to end, instead of hiring people to do them.

focus job-displacement
  A net loss of paid human roles as their tasks are automated away.

analyst suspects ai-automation causes job-displacement as displacement-hypothesis
  confidence 0.45..0.70
  note The fear is not change itself, but its speed.

# --- Evidence for the hypothesis ---

focus firms-cutting-headcount
  Firms report the same output with smaller teams after adopting AI.
  kind observation
  source "Public layoff trackers and earnings calls, 2025-2026"

focus tasks-fully-automatable
  Support, copywriting, and first-draft code now run end to end with light review.
  kind observation

link firms-cutting-headcount strongly supports displacement-hypothesis
  Headcount falling while output holds is what displacement looks like early on.

link tasks-fully-automatable supports displacement-hypothesis
  If whole task categories vanish, the roles built around them go too.
  weight 0.65

# --- The optimist's reply ---

focus technology-creates-jobs
  Historically automation destroyed roles but created more new ones over time.
  kind assumption

economist considers technology-creates-jobs

link technology-creates-jobs undercuts displacement-hypothesis
  Every past wave eventually produced jobs nobody had imagined beforehand.
  weight 0.5

# --- Why this time may be different ---

focus adaptation-too-slow
  Reskilling and new industries take years; this wave arrives in months.

analyst infers adaptation-too-slow from ai-capability-surge
  confidence 0.60

link adaptation-too-slow strongly undercuts technology-creates-jobs
  "New jobs eventually" is little comfort if workers can't reach them in time.

# --- The question it all hinges on ---

question new-jobs-in-time
  Will new jobs arrive fast enough, and within reach of displaced workers,
  to offset the losses this decade?
  about job-displacement, technology-creates-jobs
  expects forecast
  status open

# --- Where each agent stands ---

focus lived-experience
  Frontline workers already watching their teams shrink and roles merge.
  kind observation

worker accepts displacement-hypothesis
  because lived-experience
  confidence 0.80
  note Speaking from the floor, not from the forecast.

economist doubts displacement-hypothesis
  confidence 0.35
  note Betting on precedent, and on jobs we can't yet name.

# --- The decision we can't make yet ---

focus reskilling-program
  Fund large-scale reskilling and a safety net for displaced workers.

policy-maker holds reskilling-program
  until new-jobs-in-time answered
  note Can't commit the budget until the timing question resolves.
`,

  'incident-742': `# The complete example from the ThoughtML v0 spec (§14).

scope incident-742

team noticed metric-shift
  Activation metric increased after deployment.
  observed-at 2026-06-09T09:20+06:00

question cause-of-metric-shift
  What caused metric-shift?
  expects cause
  status open

team suspects deploy-change causes metric-shift as deploy-cause
  confidence 0.25..0.70
  answers cause-of-metric-shift

team holds rollback-decision
  Rollback the deployment.
  until cause-of-metric-shift answered
`,

  'multi-agent-debate': `# Multi-agent disagreement over a hypothesis — the links carry the argument.

scope payments-latency

team noticed latency-spike
  p99 checkout latency doubled at 14:00 UTC.
  observed-at 2026-06-14T14:05+00:00

alice suspects cache-eviction causes latency-spike as cache-hypothesis
  confidence 0.55
  note The timing lines up with a cache-layer deploy.

# Bob is skeptical of Alice's hypothesis.
bob doubts cache-hypothesis
  confidence 0.30
  note Latency moved before the deploy reached every node.

# Evidence for and against.
focus cache-hit-rate-drop
  Cache hit rate fell from 0.98 to 0.61 at 14:00.

focus eviction-config-unchanged
  The eviction policy hasn't changed in 30 days.

link cache-hit-rate-drop strongly supports cache-hypothesis
  A cliff in hit rate is exactly what aggressive eviction would cause.

link eviction-config-unchanged weakly undercuts cache-hypothesis
  If the policy never changed, eviction is an unlikely trigger on its own.

# Carol comes around after weighing the evidence.
carol accepts cache-hypothesis
  because cache-hit-rate-drop
  confidence 0.70
  note The hit-rate cliff outweighs the unchanged config for me.
`,

  'decision-record': `# An architecture decision recorded as reasoning, not prose.
# The graph IS the ADR: the options, the evidence against them, and the choice.

scope adr-017-datastore

question which-datastore
  Which datastore should back the event log?
  expects option
  status open

team considers postgres-option
  A single Postgres instance with a partitioned events table.

team considers kafka-option
  An append-only Kafka topic with a compacted changelog.

team considers dynamo-option
  DynamoDB with a composite sort key.

focus cross-region-cost
  Multi-region DynamoDB write costs exceed the budget on their own.

link cross-region-cost opposes dynamo-option
  Cost alone disqualifies it before we even weigh latency or ergonomics.

team rejects dynamo-option
  because cross-region-cost
  confidence 0.80
  note Reluctantly — its latency story was actually the best of the three.

focus operational-burden
  Kafka would be the team's first stateful streaming system to operate.

link operational-burden opposes kafka-option
  A new operational muscle we'd have to build in the middle of the project.

question throughput-benchmark
  Can Postgres sustain 50k events per second on target hardware?
  expects number
  status open

team holds datastore-decision
  Commit to a datastore for the event log.
  until throughput-benchmark answered
  note Provisionally Postgres, but not signed off until the benchmark lands.

focus operational-familiarity
  The team already runs Postgres in production every day.

link operational-familiarity supports postgres-option
  Boring technology the team can already debug at 3am.

team chooses postgres-option
  Start with Postgres; revisit if throughput ceilings appear.
  because operational-familiarity
  answers which-datastore
  note Optimize for what we can operate, not what benchmarks best on paper.
`,

  'agent-memory': `# An assistant's memory of a user, accrued over a session and revised as it learns.

scope user-profile

assistant noticed user-prefers-readable-syntax
  The user chose the readable action surface over the canonical core.
  asserted-at 2026-06-17T10:02+00:00

assistant noticed user-cites-specs
  The user keeps referencing the v0 specification by section number.

assistant infers user-values-standards-thinking from user-prefers-readable-syntax, user-cites-specs
  confidence 0.65
  note Two weak signals pointing the same way.

assistant remembers prefers-rust
  The user asked for the parser in Rust, as the spec recommends.
  source uri:https://example.invalid/session-log
  confidence 0.90

assistant revises user-values-standards-thinking
  confidence 0.80
  note Upgraded after the user corrected a spec misreading, unprompted.

assistant considers user-timezone
  Working hours hint at UTC+6, but this is unconfirmed.
  confidence ?
  note A guess from message timestamps, not a stated fact.
`,

  'estimate-revised': `# A belief that changes as evidence arrives. Drag the "As of" slider to
# replay it: an earlier stance dims and strikes through the moment a later one
# revises it (v0.2, Phase 3 — temporal & revision).

scope launch-readiness

# --- Day 0: an early, optimistic read ---

analyst noticed early-burndown
  The first sprint cleared 40% of the backlog — ahead of plan.
  observed-at 2026-06-01

analyst suspects early-burndown causes on-track as on-track-claim
  confidence 0.70
  asserted-at 2026-06-01
  note Comfortable start; the date looks safe.

# --- Day 7: scope grows, and the date itself is pushed out ---

analyst noticed scope-added
  Two must-have features were added after the stakeholder review.
  observed-at 2026-06-08

link scope-added undercuts on-track-claim
  Late scope eats the early lead.
  asserted-at 2026-06-08

analyst revises on-track-claim
  confidence 0.40
  asserted-at 2026-06-08
  note The new scope cancels out the fast start.

focus june-30-target
  Original commitment: ship on June 30.

focus july-14-target
  Revised commitment: ship on July 14, absorbing the new scope.
  asserted-at 2026-06-08

link july-14-target revises june-30-target
  The added scope pushed the committed date out by two weeks.
  asserted-at 2026-06-08

# --- Day 14: a hard blocker lands ---

analyst noticed integration-blocker
  The payment vendor's sandbox is down with no ETA.
  observed-at 2026-06-15

link integration-blocker undercuts on-track-claim
  Nothing ships until payments can be tested end to end.
  asserted-at 2026-06-15

analyst revises on-track-claim
  confidence 0.20
  asserted-at 2026-06-15
  note With payments blocked, holding the date is unlikely.
`,

  'sensitivity-demo': `# Which evidence is actually holding the conclusion up? Open a claim to see its
# evidence ranked by leverage — the confidence it would lose if that one link
# were removed — or switch on the "Load" lens. Then enter What-if and mute a
# node to watch the whole argument recompute (v0.2, Phase 6 — sensitivity).

scope ship-decision

# --- The hypothesis under test ---

focus ready-to-ship
  The release is safe to ship to all users on Friday.
  kind hypothesis

# --- Evidence for it, of very different load-bearing weight ---

focus canary-healthy
  A 5% canary has run for 48 hours with no error-rate or latency regression.
  kind observation

focus tests-green
  The full suite — unit, integration, end-to-end — passes on the release branch.
  kind observation

focus changelog-reviewed
  Every merged PR in the release carries a reviewer sign-off.
  kind observation

link canary-healthy strongly supports ready-to-ship
  Real traffic at smaller scale with no regression is the strongest signal we have.
  weight 0.85

link tests-green supports ready-to-ship
  Green tests are necessary, but they have passed before failed releases too.
  weight 0.4

link changelog-reviewed weakly supports ready-to-ship
  Review catches intent bugs, but says little about runtime behaviour.

# --- Evidence against ---

focus rollback-untested
  The automated rollback path hasn't been exercised since the last migration.
  kind observation

link rollback-untested undercuts ready-to-ship
  If the ship goes wrong, we're not sure we can cleanly back it out.
  weight 0.5

# --- The decision that rides on it ---

focus ship-friday
  Ship the release to 100% of users on Friday.
  kind decision

link ready-to-ship supports ship-friday
  The go/no-go call follows directly from whether the release is safe.

release-manager holds ship-friday
  note Leaning yes — but the rollback gap is the one thing that could flip it.
`,

  'capacity-plan': `# Quantities give reasoning real numbers (v0.2, Phase 7). Each focus can carry a
# typed measure — time, data, money, throughput, ratio — classified by dimension
# and normalized to a base unit where the units convert. Open a node to see it.
# (Phase 8 will compute over these.)

scope capacity-plan

focus scale-up-decision
  Add capacity ahead of the holiday traffic spike.
  kind decision

focus current-load
  Sustained production traffic today.
  kind observation
  quantity 4500 req/s

focus spike-forecast
  Expected peak during the holiday sale.
  kind observation
  quantity 14000 req/s

focus instance-throughput
  What one instance sustains in load tests before latency degrades.
  kind observation
  quantity 1200 req/s

focus latency-budget
  The p99 latency SLO we must stay under.
  kind goal
  quantity 200 ms

focus monthly-cost-per-instance
  Fully-loaded monthly cost of one instance.
  kind observation
  quantity 180 USD

focus storage-per-node
  Disk each new instance brings with it.
  kind observation
  quantity 512 GB

focus current-headroom
  Spare capacity already sitting in the current fleet.
  kind observation
  quantity 30 %

link current-load supports spike-forecast
  The forecast is a multiple of today's baseline, so the baseline grounds it.

link spike-forecast supports scale-up-decision
  A 3x jump over today's load is more than current capacity can absorb.

link instance-throughput supports scale-up-decision
  Per-instance headroom tells us how many to add.

link latency-budget supports scale-up-decision
  Holding p99 under budget during the spike takes more instances, not fewer.

link storage-per-node supports scale-up-decision
  More nodes also bring storage we happen to need.

link monthly-cost-per-instance opposes scale-up-decision
  Every added instance is recurring spend we have to justify.

link current-headroom undercuts scale-up-decision
  Some of the spike fits in existing headroom, reducing what we must add.

team holds scale-up-decision
  note Over-provisioning is cheap to reverse; under-provisioning during the sale is not.
`,

  'cost-model': `# Formulas make the document executable (v0.2, Phase 8). A focus can state
# \`= <expr>\` instead of a fixed number, and ThoughtML evaluates it over other
# foci's quantities with full unit-checking: a USD/instance times an instance is
# USD, the byte conversions in USD/GB × GB cancel, and a ratio of two costs comes
# out dimensionless. Computed values stay separate from the authored ones.

scope cost-model

focus instances
  How many instances we run.
  quantity 12 instance

focus cost-per-instance
  Fully-loaded monthly cost of one instance.
  quantity 180 USD/instance

focus monthly-compute
  Compute spend per month.
  = cost-per-instance * instances

focus storage
  Object storage we keep.
  quantity 4000 GB

focus cost-per-gb
  Storage price per gigabyte-month.
  quantity 0.02 USD/GB

focus monthly-storage
  Storage spend per month.
  = cost-per-gb * storage

focus monthly-total
  Everything we pay to run the service each month.
  = monthly-compute + monthly-storage

focus revenue
  Monthly revenue this service drives.
  quantity 50000 USD

focus gross-margin
  Share of revenue left after running costs.
  = (revenue - monthly-total) / revenue
`,

  'decision-ev': `# Decision EV closes the computational track (v0.2, Phase 9). An option leads-to
# outcomes, each with a probability and a payoff (a quantity — even a computed
# one). ThoughtML weights payoff by probability and sums: the option's expected
# value. A decision then orders its options by EV — it does not name a winner.
# Open "go-to-market" for the ordering, or switch on the "Decision" lens to
# mark the options it weighs.

scope launch-decision

focus go-to-market
  kind decision
  How aggressively to launch the new product.

# --- Option A: launch to everyone now ---

focus launch-now
  kind option
  Ship to all users on day one and capture the whole market at once.
link launch-now option-of go-to-market

# This outcome's payoff is computed, not stated: a breakout launch nets its
# revenue less the cost of supporting it (Phase 8 feeding Phase 9).
focus launch-cost
  Marketing and on-call to support a full-blast launch.
  quantity 100000 USD

focus blockbuster-revenue
  Revenue if a launch-now bet pays off.
  quantity 1000000 USD

focus blockbuster
  A breakout launch: strong demand, low churn.
  = blockbuster-revenue - launch-cost

focus stumble
  A rough launch: refunds and churn eat into the upside.
  quantity -200000 USD

link launch-now leads-to blockbuster
  probability 0.4

link launch-now leads-to stumble
  probability 0.6

# --- Option B: staged, region-by-region rollout ---

focus staged-rollout
  kind option
  Roll out region by region, fixing as we learn.
link staged-rollout option-of go-to-market

focus steady-growth
  Predictable adoption with fewer surprises.
  quantity 500000 USD

focus slow-start
  Cautious uptake, but very little downside.
  quantity 120000 USD

link staged-rollout leads-to steady-growth
  probability 0.7

link staged-rollout leads-to slow-start
  probability 0.3
`,

  'release-bet': `# The whole computational track woven into one decision (v0.2, Phases 6-9):
# payoffs computed by FORMULAS (Phase 8) over quantities (Phase 7); one outcome's
# probability borrowed from DERIVED CONFIDENCE (Phase 4) when its edge omits one;
# options ordered by EXPECTED VALUE (Phase 9); and WHAT-IF (Phase 6) reaching all
# the way through. As written, holding ranks first (212,250 vs 180,000 USD). Enter
# What-if and mute "canary-clean": belief in the polished launch falls, its
# expected value drops below shipping, and the EV ordering flips — ship-now to the top.

scope release-bet

focus release-decision
  kind decision
  Ship the new checkout flow now, or hold a week to harden it.

# --- Option A: ship now (explicit probabilities) ---

focus ship-now
  kind option
  Ship today and capture the launch window.
link ship-now option-of release-decision

focus base-revenue
  Revenue the launch window is worth.
  quantity 800000 USD

focus ship-clean
  Ships smoothly; we capture half the available revenue.
  = base-revenue * 0.5

focus ship-buggy
  A bug slips through and we burn goodwill plus a hotfix.
  quantity -150000 USD

link ship-now leads-to ship-clean
  probability 0.6
link ship-now leads-to ship-buggy
  probability 0.4

# --- Option B: hold a week (probability from evidence) ---

focus hold-week
  kind option
  Hold a week to harden the flow, then ship.
link hold-week option-of release-decision

focus harden-gain
  Extra revenue a polished launch is expected to earn.
  quantity 300000 USD

focus delay-cost
  What a week of delay costs us.
  quantity 50000 USD

focus hold-pays-off
  The extra week pays for itself - a clean, polished launch.
  = harden-gain - delay-cost

focus hold-stale
  The week is wasted: nothing improves and a rival moves first.
  quantity -80000 USD

# Evidence for hold-pays-off. Its leads-to edge states no probability, so its
# derived confidence (from this evidence) is used as the likelihood.
focus canary-clean
  A 5% canary of the hardened flow ran 48h with no regression.
  kind observation

focus load-test-passed
  The hardened flow held p99 under budget at 3x peak load.
  kind observation

link canary-clean supports hold-pays-off
link load-test-passed supports hold-pays-off

link hold-week leads-to hold-pays-off
link hold-week leads-to hold-stale
  probability 0.1
`,

  'canonical-core': `# The same reasoning as multi-agent-debate, written directly in the canonical
# core (§3.2) with focus / link / stance records — no readable-action sugar.

scope payments-latency

focus latency-spike
  p99 checkout latency doubled at 14:00 UTC.

focus cache-eviction
  Aggressive eviction dropping hot keys under load.

link cache-hypothesis: cache-eviction causes latency-spike
  The proposed mechanism: evicted hot keys force slow cold reads.

stance alice suspects cache-hypothesis
  confidence 0.55

stance bob doubts cache-hypothesis
  confidence 0.30
`,

  'nested-scope': `# Nested scopes (Phase 5): members are written *inside* a scope by indentation.
# Each member inherits the scope's provenance/temporal context (source,
# observed-at), and a sub-scope can override that context for its own members.
# Switch the view to "structural" to see scopes drawn as nested boxes.
scope incident-993
  source pagerduty
  observed-at 2026-02-11T09:00Z

  focus latency-spike
    Checkout p99 latency tripled after the 09:00 rollout.

  focus deploy-1f2c
    The rollout swapped the cache layer.

  link deploy-1f2c causes latency-spike

  scope mitigation
    observed-at 2026-02-11T09:45Z

    focus rollback
      Roll back deploy-1f2c and re-run the canary.

    link rollback prevents latency-spike
`,

  'profile-dialect': `# A profile (Phase 5) declares a domain dialect — custom kinds, relations,
# fields, and postures — so strict validation accepts them with no warnings.
# Here a risk-analysis dialect. Defending against a risk needs no special
# relation: a mitigation just "opposes" the risk (a core attack relation), and
# the grounded labelling reinstates whatever the risk threatened. risk,
# mitigation, aggravates, likelihood, and flags are this dialect's own — remove
# the profile and each would trip an "unknown …" lint.
profile risk-analysis
  kinds risk, mitigation
  relations aggravates
  fields likelihood
  postures flags

scope supply-chain

focus port-strike
  kind risk
  likelihood 0.4

focus just-in-time
  kind risk
  likelihood 0.5

focus dual-sourcing
  kind mitigation

link dual-sourcing opposes port-strike
link just-in-time aggravates port-strike

stance ops flags port-strike
  confidence 0.3
  note Low residual risk once dual-sourcing opposes the strike.
`,

  'shared-defs': `# Shared definitions other documents import (Phase 5). Strict-clean on its own:
# its foci are members of the \`shared\` scope, so nothing is orphaned.
scope shared
  focus capacity-budget
    quantity 1000 req/s

  focus slo-target
    p99 latency budget is 200 ms.
`,

  'imports-demo': `# Imports another document and references its objects by namespace (Phase 5).
# The playground resolves \`import\` against the other bundled examples, so
# \`base.capacity-budget\` below points into shared-defs.
import shared-defs as base

scope rollout

focus rollout-plan
  Ship the rollout to 100% over a week.

link rollout-plan depends-on base.capacity-budget

stance ops accepts rollout-plan
  confidence 0.8
`,

  'grand-tour': `# grand-tour — one decision that exercises the whole language.
#
# It imports a shared budget, declares an SRE dialect (profile), nests its
# reasoning in scopes that pass down provenance, measures things (quantities),
# computes a cost and a payoff (formulas), weighs two options by expected value
# (decision EV), carries graded evidence, an attack, and a mitigation (confidence
# + argument status), and revises an estimate over time. Try the lenses and the
# as-of slider; switch to the structural view to see the scopes as nested boxes.
import shared-defs as base

profile sre
  kinds risk

scope capacity-program
  source platform-review
  observed-at 2026-03-01T09:00Z

  scope signals
    focus traffic-now
      kind observation
      quantity 850 req/s
    focus growth-trend
      kind hypothesis
      Traffic keeps climbing toward the capacity ceiling.
    focus seasonal-doubt
      kind assumption
      The Q1 surge might be seasonal rather than a real trend.
    focus load-test
      kind observation
      A sustained load test reproduced the growth under steady traffic.
    link traffic-now supports growth-trend
    link load-test strongly supports growth-trend
    link seasonal-doubt undercuts growth-trend
    link load-test opposes seasonal-doubt

  scope estimate
    focus runway-early
      kind claim
      asserted-at 2026-02-15T00:00Z
      We have about six months before we hit the ceiling.
    focus runway-now
      kind claim
      asserted-at 2026-03-01T00:00Z
      Revised to about three months after the Q1 surge.
    link runway-now revises runway-early

  scope decision
    focus capacity-decision
      kind decision
      How do we stay ahead of the capacity ceiling?
    link capacity-decision depends-on base.capacity-budget

    focus migrate
      kind option
    focus shard
      kind option
    link migrate option-of capacity-decision
    link shard option-of capacity-decision

    focus migrate-revenue
      kind assumption
      quantity 1300000 USD
    focus migrate-budget
      kind assumption
      quantity 300000 USD
    focus migrate-ops
      kind assumption
      quantity 120000 USD
    focus migrate-cost
      First-year migration cost.
      = migrate-budget + migrate-ops
    focus migrate-win
      kind outcome
      = migrate-revenue - migrate-cost
    focus migrate-stall
      kind outcome
      quantity -200000 USD
    link migrate leads-to migrate-win
      probability 0.6
    link migrate leads-to migrate-stall
      probability 0.4

    focus shard-win
      kind outcome
      quantity 500000 USD
    focus shard-strain
      kind outcome
      quantity -50000 USD
    link shard leads-to shard-win
      probability 0.7
    link shard leads-to shard-strain
      probability 0.3

    team chooses migrate
      confidence 0.7

  scope risks
    focus migration-risk
      kind risk
      A hard cutover could cause downtime.
    focus canary-cutover
      kind action
      Roll over a canary slice first, then ramp.
    link migration-risk opposes migrate
    link canary-cutover opposes migration-risk
`,

  'why-harvard': `# why-harvard — the reasoning behind committing to Harvard.
#
# A personal decision, reasoned out: goals up front, what's known linked to
# those goals with graded evidence (and one honest doubt), two options weighed
# by expected value, the choice recorded, and the real downside kept on the
# record with a plan that defends against it. Everything inherits the scope's
# provenance and date; switch to the structural view to see the four sub-scopes.
scope college-choice
  source self-reflection
  asserted-at 2026-04-01T00:00Z

  scope what-i-want
    focus goal-research
      kind goal
      Do undergraduate research with leading faculty.
    focus goal-network
      kind goal
      A network that opens doors regardless of field.
    focus goal-aid
      kind goal
      Graduate with as little debt as possible.

  scope what-i-know
    focus admit-harvard
      kind observation
      Admitted to Harvard with a strong aid package.
    focus faculty-fit
      kind observation
      Two labs I emailed replied and take undergraduates.
    focus aid-offer
      kind observation
      quantity 78000 USD
      Annual grant aid offered — grants, not loans.
    focus prestige-signal
      kind claim
      The brand helps for the first job and grad-school apps.
    focus prestige-doubt
      kind assumption
      A few years into a career, fit may matter more than prestige.
    link admit-harvard enables harvard
    link faculty-fit supports goal-research
    link aid-offer strongly supports goal-aid
    link prestige-signal supports goal-network
    link prestige-doubt undercuts prestige-signal

  scope the-decision
    focus where-to-go
      kind decision
      Which offer do I commit to?
    focus harvard
      kind option
    focus state-honors
      kind option
    link harvard option-of where-to-go
    link state-honors option-of where-to-go

    # Rough five-year "opportunity value", net of cost.
    focus harvard-thrive
      kind outcome
      quantity 600000 USD
    focus harvard-coast
      kind outcome
      quantity 150000 USD
    link harvard leads-to harvard-thrive
      probability 0.7
    link harvard leads-to harvard-coast
      probability 0.3

    focus state-solid
      kind outcome
      quantity 400000 USD
    focus state-flat
      kind outcome
      quantity 250000 USD
    link state-honors leads-to state-solid
      probability 0.5
    link state-honors leads-to state-flat
      probability 0.5

    link where-to-go depends-on goal-research
    link where-to-go depends-on goal-aid

    me chooses harvard
      confidence 0.75
      note Faculty access and the aid package clear a bar the state offer can't.

  scope second-thoughts
    focus far-from-home
      kind observation
      It's a five-hour flight from family.
    focus visit-plan
      kind action
      Visit at reading week and over the summer.
    link far-from-home opposes harvard
    link visit-plan opposes far-from-home
`,

  'self-audit': `# self-audit — an agent's reasoning that its own structure defeats.
#
# This document is diagnostically CLEAN: no errors, no warnings. The form is fine.
# But the mirror (the audit pass, on in the playground) flags that the agent
# asserts high confidence in a conclusion its own recorded evidence defeats — it
# wrote down the counter-observation, then shipped anyway. The tool's job is to
# show you that disagreement, not to make the call for you.

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
`,
}

export const DEFAULT_EXAMPLE = 'ai-and-jobs'
