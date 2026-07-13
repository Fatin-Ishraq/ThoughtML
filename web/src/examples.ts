// Bundled example sources, mirroring examples/*.thml.
// Embedded as strings so the playground is fully self-contained.

export const EXAMPLES: Record<string, string> = {
  'ship-the-hotfix': `# ship-the-hotfix — a clean document the mirror still catches.
#
# The form is fine: zero errors, zero warnings. But \`--audit\` flags that the
# on-call engineer holds "safe to ship" at 0.90 while their own recorded evidence
# — a failing canary — defeats it. ThoughtML shows the conflict; it does not
# decide. This is the flagship demonstration of the mirror.

focus hotfix-is-safe
  kind claim
  The payments hotfix is safe to ship to production now.

focus suite-is-green
  kind observation
  The full unit and integration suite passed on the release branch.

focus canary-errored
  kind observation
  The 5% canary threw a spike of HTTP 500s on checkout within ten minutes.

link suite-is-green supports hotfix-is-safe
link canary-errored opposes hotfix-is-safe

oncall holds hotfix-is-safe
  confidence 0.9 assumed
  note Shipping — the suite is green and the release window closes at 17:00.`,
  'triage-742': `# triage-742 — the smallest complete piece of reasoning.
#
# An on-call team notices a metric move, opens a question about the cause,
# records a suspicion (a stance over a \`causes\` edge, confidence as a range),
# and makes a decision that is blocked until the question is answered. Dated,
# so the viewer's play button replays it in the order it actually happened.

scope incident-742

team noticed error-rate-up
  Checkout error rate jumped from 0.2% to 3% right after the 14:00 deploy.
  observed-at 2026-03-04T14:12+06:00

question what-caused-it
  What caused the error-rate spike?
  expects cause
  status open
  asserted-at 2026-03-04T14:15+06:00

team suspects deploy-1487 causes error-rate-up as deploy-cause
  confidence 0.3..0.7
  answers what-caused-it
  asserted-at 2026-03-04T14:20+06:00

team holds rollback
  Roll back deploy-1487 and freeze further releases.
  until what-caused-it answered
  asserted-at 2026-03-04T14:25+06:00`,
  'bad-oyster': `# bad-oyster — everyday causal reasoning.
#
# After a rough night, Sam reasons backward from symptoms to a likely cause and
# raises the open question that would settle it. Shows the \`asks\` posture — an
# agent putting a question on the table — alongside \`suspects\` and a \`causes\` edge.

focus felt-sick
  kind observation
  Nausea and cramps set in about four hours after dinner.

sam suspects raw-oysters causes felt-sick as oyster-theory
  confidence 0.6 estimated
  note Classic timing for shellfish, but not proof.

question what-made-me-sick
  What actually caused the illness?
  expects cause
  status open

sam asks what-made-me-sick
  note Worth ruling out the leftover chicken from lunch before blaming the oysters.`,
  'weekend-plan': `# weekend-plan — a small, everyday decision, written plainly.
#
# A decision, two options, a goal they serve, and the pick. The most pared-down
# shape in the set: proof that ThoughtML reads naturally even for low-stakes
# reasoning, not just engineering or research.

decision weekend-choice
  How to spend the weekend.

goal recharge
  Come back Monday actually rested.

option cabin-trip
  Two nights at a cabin upstate, no wifi.

option stay-in
  A quiet weekend at home catching up on sleep.

link cabin-trip option-of weekend-choice
link stay-in option-of weekend-choice
link cabin-trip enables recharge
link stay-in enables recharge

observation long-drive
  The cabin is a four-hour drive each way.

link long-drive opposes cabin-trip

me chooses cabin-trip
  because recharge
  note Worth the drive — the change of scenery is the whole point.`,
  'pr-feedback': `# pr-feedback — \`undercuts\` (attack an inference) vs \`opposes\` (attack a claim).
#
# In review, two comments push back in different ways. One attacks the
# CONCLUSION head-on (\`opposes\`). The other leaves the conclusion alone and
# attacks the REASONING that supports it (\`undercuts\` the inference itself).
# ThoughtML keeps the two moves distinct, so the argument graph stays honest.

claim ready-to-merge
  This pull request is ready to merge.

observation benchmarks-improved
  The new index cut p95 query latency by 40% in the benchmark.

link perf-argument: benchmarks-improved supports ready-to-merge

observation benchmark-was-warm-cache
  The benchmark ran against a warm cache, unlike production.

link benchmark-was-warm-cache undercuts perf-argument

observation no-rollback-plan
  There is no rollback plan for the schema migration.

link no-rollback-plan opposes ready-to-merge

reviewer doubts ready-to-merge
  because no-rollback-plan
  note The warm-cache caveat weakens the perf argument; the missing rollback is the real blocker.`,
  'choose-datastore': `# choose-datastore — an architecture decision, as a checkable graph.
#
# The gating question, the options weighed, the one rejected (kept on the record
# as \`abandoned\`, not deleted), the one chosen, and the benchmark that blocked
# sign-off \`until\` it ran. When the load test passed, the question moved to
# \`settled\`. An ADR you can lint.

scope adr-datastore

decision datastore-choice
  Which datastore backs the new events service.

option postgres
  Managed Postgres with a JSONB events table.

option dynamo
  DynamoDB with a single-table design.

option cassandra
  A self-hosted Cassandra cluster.
  status abandoned

link postgres option-of datastore-choice
link dynamo option-of datastore-choice
link cassandra option-of datastore-choice

observation team-knows-sql
  The team has deep Postgres experience and none operating Cassandra.

link team-knows-sql supports postgres
link team-knows-sql opposes cassandra

architect rejects cassandra
  note Operational burden we can't staff — parked with its reason, not deleted.

question benchmark-passed
  Did Postgres hold p99 under 2x projected load?
  expects observation
  status settled

observation load-test-ok
  Postgres held p99 at 45ms under 2x projected write load.

link load-test-ok answers benchmark-passed

architect chooses postgres
  because team-knows-sql
  until benchmark-passed answered`,
  'prod-outage': `# prod-outage — a postmortem as a causal graph.
#
# The chain behind a 38-minute outage: the root cause sits in a nested scope with
# its own timestamp, the failures it caused flow down, an \`action\` recovers it,
# and a new control \`prevents\` a repeat. An acyclic causes/enables/prevents graph,
# with \`-by\` attribution recording who saw what and which reading proved unreliable.

scope postmortem-2026-03-11
  source pagerduty
  observed-at 2026-03-11T02:00Z

  observation checkout-down
    Checkout was unavailable for 38 minutes.
    status settled

  observation writes-failing
    Every write failed once the database disk filled.
    noticed-by monitoring

  observation disk-filled
    The primary database disk hit 100% at 02:03.

  link disk-filled causes writes-failing
  link writes-failing causes checkout-down

  observation dashboards-green
    The status dashboards showed green the whole time.
    undercut-by stale-metrics

  observation stale-metrics
    The metrics pipeline had lagged 15 minutes behind reality.

  scope root-cause
    observed-at 2026-03-11T03:30Z
    observation verbose-logging-on
      A debug flag left verbose logging on in production.
    observation log-rotation-off
      Log rotation was misconfigured, so debug logs grew unbounded.

    link verbose-logging-on enables log-rotation-off
    link log-rotation-off causes disk-filled

  action purge-and-fix
    Purged old logs and repaired the rotation cron; writes recovered at 02:41.
    asserted-at 2026-03-11T02:41Z

  link purge-and-fix prevents checkout-down

  observation disk-alert
    A disk-usage alert now fires at 80% utilization.

  link disk-alert prevents disk-filled`,
  'differential-dx': `# differential-dx — a clinician's differential diagnosis.
#
# Three competing hypotheses for one presentation, and the findings that support
# or defeat each. The proposed diagnoses are \`candidate-for\` the open question —
# they don't resolve it. Once the labs return, one hypothesis \`answers\` it. Note
# \`candidate-for\` (proposing) versus \`answers\` (resolving) are different edges.

scope chest-pain-case

observation presentation
  A 45-year-old with acute chest pain radiating to the left arm, onset 30 minutes ago.

hypothesis mi
  Acute myocardial infarction.

hypothesis reflux
  Severe acid reflux.

hypothesis costochondritis
  Musculoskeletal chest-wall inflammation.

question the-diagnosis
  What is causing the chest pain?
  about presentation
  expects hypothesis
  status settled

candidate-for the-diagnosis
  mi
  reflux
  costochondritis

observation troponin-elevated
  Serial troponin returned sharply elevated.

link troponin-elevated supports mi
link troponin-elevated opposes reflux

observation st-elevation
  The ECG shows ST-segment elevation in the inferior leads.

link st-elevation supports mi

observation reproducible-pain
  The pain was partly reproducible on chest-wall palpation.

link reproducible-pain supports costochondritis
link reproducible-pain undercuts st-elevation

link mi answers the-diagnosis

clinician accepts mi
  because troponin-elevated
  confidence 0.92 measured
  note ST-elevation MI — activate the cath lab; the palpation finding is incidental.`,
  'hiring-panel': `# hiring-panel — several interviewers, one call, honest disagreement.
#
# Three interviewers weigh the same candidate and land in different places. The
# evidence is shared; the confidence is not. \`because\` ties each stance to what
# moved it, and per-stance \`note\`s keep the panel's actual voices on the record.
# One interviewer's "no tests" worry is itself undercut — was it a real signal,
# or an artifact of a rushed take-home?

claim strong-hire
  Priya is a strong hire for the senior backend role.

observation aced-system-design
  Designed a clean, scalable rate limiter under time pressure.

observation great-references
  Two former leads gave unusually strong references.

observation shaky-on-testing
  Wrote almost no tests unprompted during the take-home.

observation take-home-was-rushed
  The take-home was completed in one evening around a full-time job.

link aced-system-design supports strong-hire
link great-references supports strong-hire
link shaky-on-testing opposes strong-hire
link take-home-was-rushed undercuts shaky-on-testing

lead holds strong-hire
  confidence 0.8 estimated
  because aced-system-design
  note The design round was the best I've seen this cycle.

ic accepts strong-hire
  confidence 0.65 estimated
  because great-references

skeptic doubts strong-hire
  confidence 0.45 estimated
  because shaky-on-testing
  note Testing discipline matters here; the rushed-take-home point partly answers me.`,
  'replication-study': `# replication-study — weighing a scientific claim on the evidence.
#
# A hypothesis, a pre-registered replication that supports it, a failed
# replication that opposes it, and a methodological critique that \`undercuts\` the
# failed one rather than attacking the hypothesis directly. Each weight carries a
# \`measured\` or \`estimated\` basis, so the strength of every edge says on what
# footing it stands.

hypothesis effect-is-real
  The facilitation effect reported in the 2019 study is real.

observation direct-replication
  A pre-registered direct replication reproduced the effect at p < 0.01.

observation failed-replication
  A larger, better-powered study found no effect.

observation different-task
  The failed replication substituted a materially harder task.

link direct-replication supports effect-is-real
  weight 0.8 measured

link failed-replication opposes effect-is-real
  weight 0.6 measured

link different-task undercuts failed-replication
  weight 0.5 estimated

researcher accepts effect-is-real
  confidence 0.7 estimated
  because direct-replication
  note The null result is confounded by the task change; the pre-registered replication is the cleaner signal.`,
  'roadmap-priorities': `# roadmap-priorities — product planning: grouping vs deciding.
#
# The three friction points behind the Q3 theme are grouped with \`part-of\` —
# structure, not evidence, so listing them never inflates the theme's confidence
# (using \`supports\` here would be the classic mistake). The open question of what
# to build first contains its candidate options as a nested thought-tree.

scope q3-roadmap

claim onboarding-friction
  New teams hit three distinct friction points before they reach first value.

observation onboarding-drop-off
  60% of new teams never finish setup.

observation slow-first-import
  The first data import averages 40 minutes.

observation unclear-next-step
  New users report not knowing what to do after signup.

part-of onboarding-friction
  onboarding-drop-off
  slow-first-import
  unclear-next-step

question build-first
  Which fix ships first this quarter?
  expects option
  status open
  option guided-setup
    A guided setup wizard that walks teams to first value.
  option faster-import
    A streaming import that starts returning rows in seconds.
  option sample-project
    A one-click sample project to explore before importing real data.

observation import-top-complaint
  Import speed is the single most common complaint in support tickets.

link import-top-complaint supports faster-import

# A stated assumption that constrains the call, and the option the PM is weighing
# first. \`considers\` puts an option on the table; \`assumption\` records what we're
# taking as given — the streaming rewrite is the heaviest lift under one squad.
assumption one-squad-only
  Only one engineering squad is free for roadmap work this quarter.

link one-squad-only opposes faster-import

pm considers guided-setup
  note Lowest-lift of the three — worth weighing first given the capacity constraint.`,
  'launch-readiness': `# launch-readiness — a belief that changes as the evidence lands.
#
# The go/no-go readiness call is asserted, then revised twice over three days as
# new signals arrive. Earlier versions are \`superseded\`, not erased — run
# \`--as-of\` (or drag the viewer's time slider) to replay the call as it stood at
# any moment. \`valid-during\` marks the window a finding actually held.

scope launch-readiness

observation readiness-v1
  On track for Friday launch; all P0 bugs are closed.
  asserted-at 2026-05-04T10:00Z
  status superseded

observation load-test-failed
  The pre-launch load test failed at 1.5x projected traffic.
  asserted-at 2026-05-05T14:00Z
  valid-during 2026-05-05/2026-05-06

link load-test-failed opposes readiness-v1

observation readiness-v2
  Launch at risk: a load-test regression must be fixed first.
  asserted-at 2026-05-05T15:00Z
  status superseded

link readiness-v2 revises readiness-v1

observation fix-verified
  The connection-pool fix passed a re-run at 2x traffic.
  asserted-at 2026-05-06T11:00Z

observation readiness-v3
  Go for Friday launch; the load-test regression is resolved.
  asserted-at 2026-05-06T12:00Z

link fix-verified supports readiness-v3
link readiness-v3 revises readiness-v2`,
  'assistant-memory': `# assistant-memory — what an AI assistant carries between turns.
#
# Across one session the assistant notices facts, *infers* a preference from two
# of them (infers wires its sources explicitly, so the reasoning is visible),
# commits it to memory with a source and a timestamp, then revises it when the
# user contradicts it. Confidence can be genuinely unknown (\`?\`), and every
# belief stays auditable rather than collapsing into a hidden score.

scope user-session

observation asked-for-python
  The user asked for the first snippet in Python.
  observed-at 2026-06-01T09:10Z

observation mentioned-pandas
  The user mentioned working in pandas every day.
  observed-at 2026-06-01T09:12Z

assistant infers prefers-python from asked-for-python mentioned-pandas
  kind memory
  The user prefers Python for code examples.
  confidence 0.6 estimated

assistant remembers prefers-python
  source uri:session/2026-06-01
  asserted-at 2026-06-01T09:13Z

observation asked-for-rust
  Later the user asked for a Rust version, explicitly.
  observed-at 2026-06-01T09:40Z

link asked-for-rust undercuts prefers-python

assistant revises prefers-python
  because asked-for-rust
  confidence ?
  note The preference looks task-specific, not a global default — downgrading to unknown.`,
  'moderation-decision': `# moderation-decision — an AI moderation call, emitted for a human to audit.
#
# The classifier states its claim, the signals for and against it, the action it
# would take, and how sure it is — all as structure a reviewer (or another agent)
# can check. The point of writing the reasoning down is that the confidence and
# the evidence become inspectable, instead of collapsing into one opaque score.

focus violates-policy
  kind claim
  This post violates the harassment policy.

observation targets-individual
  The post names a specific user and tells them to leave the platform.

observation quotes-prior-abuse
  It quotes a message already actioned for abuse.

observation flagged-satire
  The account is flagged as satire and the tone is exaggerated.

link targets-individual supports violates-policy
link quotes-prior-abuse supports violates-policy
link flagged-satire undercuts targets-individual

action remove-post
  Remove the post and warn the author.

link violates-policy supports remove-post

classifier holds violates-policy
  confidence 0.72 estimated
  because quotes-prior-abuse
  note Directed at a named user with a leave-or-else demand; the satire flag is noted but the target is real.`,
  'merge-conflict-beliefs': `# merge-conflict-beliefs — two agents, one id, two definitions.
#
# When two agents (or two branches of one investigation) are merged, they can each
# define the same focus a different way. ThoughtML keeps BOTH — it never silently
# drops one — and \`--audit\` reports a \`definition-divergence\`. That is what makes
# concurrent, multi-agent authoring lossless: nothing is overwritten, and the
# disagreement is surfaced instead of hidden. Written with a mix of the readable
# surface and the raw \`stance\`/\`link\` core, to show they are one model underneath.

scope incident-merge

observation checkout-failing
  Checkout has been failing intermittently for two hours.
  observed-at 2026-04-02T13:00Z

observation error-spike
  5xx errors on the payments service spiked to 20x baseline.
  observed-at 2026-04-02T13:05Z

# --- Branch A: the payments team's investigation ---
focus root-cause
  The failures are caused by the new payment gateway timing out under load.

observation gateway-latency
  The gateway's p99 latency crossed its 5s timeout during peak.

link gateway-latency supports root-cause
link root-cause causes checkout-failing
link root-cause causes error-spike

stance payments-agent holds root-cause
  confidence 0.6
  because gateway-latency

# --- Branch B: the database team's investigation, merged in ---
# Same id, a different story. Both definitions are retained on \`divergent\`; the
# mirror reports the clash rather than quietly keeping one and dropping the other.
focus root-cause
  The failures are caused by database connection-pool exhaustion.

observation pool-saturated
  The primary's connection pool sat at 100% utilization throughout the window.

link pool-saturated supports root-cause

stance database-agent holds root-cause
  confidence 0.55
  because pool-saturated

question which-root-cause
  Which root cause is correct — or are both contributing?
  about root-cause
  expects claim
  status open`,
  'cloud-bill': `# cloud-bill — a monthly cost model that computes itself.
#
# Every input line is a focus with a \`quantity\`; every derived line is an
# \`= formula\` over the others. The parser checks units as it goes (USD/hour ×
# hour = USD, USD × a dimensionless factor = USD), so a unit mistake is caught,
# not silently shipped. Change one input and the whole bill recomputes — the
# numbers are a *second reading* of what you wrote, not a spreadsheet you keep by
# hand. Turn it on with \`--compute\`.

scope cloud-bill-march

# --- Compute ---
observation instance-price
  On-demand price per instance-hour.
  quantity 0.096 USD/hour

observation instance-hours
  Total instance-hours across the fleet this month.
  quantity 21600 hour

focus compute-cost
  kind claim
  Monthly compute spend.
  = instance-price * instance-hours

# --- Storage ---
observation storage-price
  Object-storage price per GB-month.
  quantity 0.021 USD/GB

observation storage-used
  Average stored volume this month.
  quantity 12000 GB

focus storage-cost
  kind claim
  Monthly storage spend.
  = storage-price * storage-used

# --- Egress ---
observation egress-price
  Data-transfer price per GB.
  quantity 0.085 USD/GB

observation egress-volume
  Outbound transfer this month.
  quantity 8000 GB

focus egress-cost
  kind claim
  Monthly egress spend.
  = egress-price * egress-volume

# --- Database ---
observation db-price
  Managed-database price per instance-hour.
  quantity 0.24 USD/hour

observation db-hours
  Database instance-hours this month.
  quantity 1440 hour

focus db-cost
  kind claim
  Monthly database spend.
  = db-price * db-hours

# --- Support ---
observation support-plan
  Flat monthly business-support fee.
  quantity 400 USD

# --- Totals ---
focus total-bill
  kind claim
  Total monthly cloud bill.
  = compute-cost + storage-cost + egress-cost + db-cost + support-plan

# --- Unit economics ---
observation active-users
  Monthly active users served this month.
  quantity 5000 user

focus cost-per-user
  kind claim
  Blended infrastructure cost per active user.
  = total-bill / active-users`,
  'ship-or-hold': `# ship-or-hold — the whole compute layer in one decision.
#
# This is the capstone. It weaves together every part of the second reading:
#   * formula payoffs (\`= expr\`) that compute an outcome's value from inputs,
#   * a probability *borrowed from derived confidence* — one \`leads-to\` omits its
#     probability, so the engine uses the outcome's own belief (from the evidence
#     below) as its likelihood: belief becomes probability, once and visibly,
#   * expected-value ranking over the options, and
#   * a what-if: mute one piece of evidence and the EV ordering flips.
# None of it decides for you — it is a second reading of the numbers you wrote.
# Turn it on with \`--compute\`.

scope release-decision

observation weekly-revenue
  Checkout revenue per week.
  quantity 400000 USD

observation delay-cost
  Revenue given up by delaying the launch one week.
  quantity 100000 USD

decision release-plan
  Ship the new checkout flow now, or hold a week for an extended test pass?

option ship-now
  Ship to 100% of traffic today.

option hold-week
  Hold one week and run an extended test pass first.

link ship-now option-of release-plan
link hold-week option-of release-plan

# --- If we ship now ---
outcome ship-clean
  Ships cleanly; a full extra week of checkout revenue.
  = weekly-revenue

outcome ship-breaks
  A checkout bug reaches production: refunds, churn, and firefighting.
  quantity -200000 USD

link ship-now leads-to ship-clean
  probability 0.75
link ship-now leads-to ship-breaks
  probability 0.25

# --- If we hold a week ---
# hold-pays-off's probability is OMITTED on purpose: the engine falls back to the
# outcome's own derived confidence (from the two observations below) as the
# probability. That is the one place belief turns into likelihood.
outcome hold-pays-off
  The extra pass catches the latent bug; we ship next week with no incident.
  = weekly-revenue - delay-cost

outcome hold-wasted
  The pass finds nothing; a week of revenue lost for no reason.
  quantity -100000 USD

link hold-week leads-to hold-pays-off
link hold-week leads-to hold-wasted
  probability 0.15

observation flaky-tests
  Two flaky checkout tests have already surfaced this sprint.

observation similar-bug-last-quarter
  A near-identical last-minute checkout bug shipped last quarter.

link flaky-tests supports hold-pays-off
  weight 0.8
link similar-bug-last-quarter supports hold-pays-off
  weight 0.7

release-manager chooses hold-week
  because hold-pays-off
  note The extra week pays for itself when a checkout bug is even moderately likely.`,
  'threat-model': `# threat-model — a security review written in its own dialect.
#
# ThoughtML's core vocabulary is deliberately small. When a domain needs its own
# words, a \`profile\` declares them — and everything below is checked against that
# profile, so a word it does not declare still warns. Here an appsec dialect adds
# \`threat\`/\`control\`/\`weakness\` kinds, \`mitigates\`/\`aggravates\`/\`exposes\`
# relations, \`likelihood\`/\`severity\` fields, and a \`flags\` posture. Same engine,
# domain-native words. A control that mitigates a threat is just its attacker.

profile appsec
  kinds threat, control, weakness
  relations mitigates, aggravates, exposes
  fields likelihood, severity
  postures flags

scope payment-service-review

focus sql-injection
  kind threat
  Unsanitized order IDs reach the query builder.
  likelihood medium
  severity critical

focus credential-stuffing
  kind threat
  Reused passwords let attackers replay leaked credentials at scale.
  likelihood high
  severity high

focus token-theft
  kind threat
  A stolen session token grants full account access until it expires.
  likelihood low
  severity high

focus no-rate-limit
  kind weakness
  The login endpoint enforces no rate limiting.

link no-rate-limit aggravates credential-stuffing
link no-rate-limit exposes token-theft

focus parameterized-queries
  kind control
  All database access uses bound parameters.

focus mfa
  kind control
  Multi-factor authentication is available on login.

focus short-token-ttl
  kind control
  Session tokens expire after 30 minutes of inactivity.

focus login-rate-limit
  kind control
  Progressive rate limiting on the login endpoint.

link parameterized-queries mitigates sql-injection
link mfa mitigates credential-stuffing
link mfa mitigates token-theft
link short-token-ttl mitigates token-theft
link login-rate-limit mitigates credential-stuffing

stance sec-team flags credential-stuffing
  confidence 0.5 estimated
  note Highest residual risk: MFA is enrolled on only 60% of accounts and rate limiting is not yet deployed.`,
  'control-library': `# control-library — a shared, importable library of definitions.
#
# A library holds reusable nodes that other documents pull in by namespace. It has
# to stand on its own — strict-clean as a single document — so downstream docs can
# \`import\` it and reference \`namespace.id\`. This one defines the organization's
# baseline security controls, the program that groups them, and its budget.
# (See compliance-rollout for the importer that consumes it.)

scope baseline-controls

claim encryption-at-rest
  All data stores encrypt data at rest with managed keys.

claim access-reviews
  Access is reviewed quarterly and revoked on role change.

claim audit-logging
  Every privileged action is written to an append-only audit log.

claim backup-policy
  Daily backups with 30-day retention and a tested restore path.

claim incident-runbook
  A maintained runbook and on-call rotation for security incidents.

claim controls-baseline
  The organization's baseline security-control program.

part-of controls-baseline
  encryption-at-rest
  access-reviews
  audit-logging
  backup-policy
  incident-runbook

observation audit-budget
  Annual budget allocated to run the compliance program.
  quantity 250000 USD

link audit-budget enables controls-baseline`,
  'compliance-rollout': `# compliance-rollout — rolling the baseline controls out to a new region.
#
# This document \`import\`s the shared control-library under a namespace and refers
# to its nodes as \`baseline.<id>\`. It is checked as a *project* — the importer
# plus the library it pulls in — so the cross-document references resolve. The
# rollout itself is a decision with a gating question, a first action, and
# explicit dependencies on the imported controls.

import control-library as baseline

scope eu-rollout

goal eu-compliant
  Bring the new EU region into compliance with the baseline controls.

decision rollout-approach
  How to roll the baseline controls out to the EU region.

option big-bang
  Enable every control at once during a single maintenance window.

option phased
  Enable controls over three weekly phases, riskiest change last.

link big-bang option-of rollout-approach
link phased option-of rollout-approach
link big-bang enables eu-compliant
link phased enables eu-compliant

observation eu-data-residency
  EU data must stay in-region, which constrains where backups may live.

link eu-data-residency opposes big-bang

link phased depends-on baseline.encryption-at-rest
link phased depends-on baseline.audit-logging
link phased depends-on baseline.backup-policy

question restore-tested
  Has an in-region restore been tested end to end?
  expects observation
  status open

action enable-phase-1
  Turn on encryption-at-rest and audit-logging in the EU region.

link enable-phase-1 depends-on baseline.encryption-at-rest

compliance-lead chooses phased
  because eu-data-residency
  until restore-tested answered`,
}

export const DEFAULT_EXAMPLE = 'ship-the-hotfix'

// Parked from the example tray to keep it approachable: the compute capstones,
// the profile dialect, the definition-divergence demo, and the import pair.
// They stay in EXAMPLES (their .thml ships and compliance-rollout still resolves
// control-library's import) — just not shown as their own pill. Empty this set
// to surface them all.
export const ADVANCED_EXAMPLES = new Set([
  'merge-conflict-beliefs',
  'cloud-bill',
  'ship-or-hold',
  'threat-model',
  'control-library',
  'compliance-rollout',
])
