// Bundled example sources, mirroring examples/*.thml.
// Embedded as strings so the playground is fully self-contained.

export const EXAMPLES: Record<string, string> = {
  'pour-the-slab': `# pour-the-slab — clean in form, and caught by the mirror anyway.
#
# Zero errors, zero warnings: the structure is well formed. But \`--audit\` reports a
# \`confidence-vs-status\` error, because the site engineer holds "conditions are fine"
# at 0.88 while the freeze reading they logged themselves defeats it. ThoughtML shows
# the conflict. It does not decide which side is right.

focus conditions-are-fine
  kind claim
  Conditions on site are fine to pour the foundation slab this afternoon.

focus truck-is-booked
  kind observation
  The ready-mix truck is booked for 14:00 and the full crew is on site.
  source site-diary
  observed-at 2026-03-11

focus overnight-freeze
  kind observation
  The site thermometer logged minus four degrees from 02:00 to 06:00, and tonight's
  forecast repeats it. Fresh concrete that freezes before it sets never recovers.
  source site-diary
  observed-at 2026-03-11

link truck-is-booked supports conditions-are-fine
link overnight-freeze opposes conditions-are-fine

site-engineer holds conditions-are-fine
  confidence 0.88 assumed
  note Pouring today. The truck is booked and the crew moves to another job Thursday.`,
  'why-the-loaf-failed': `# why-the-loaf-failed — an ordinary question, asked properly.
#
# Three explanations are put forward with \`candidate-for\`, which proposes without
# resolving anything. Only the one the evidence settles gets \`answers\`. Getting that
# pair the right way round is what keeps a question honest: a list of guesses should
# never read as an answer.

question why-flat-loaf
  Why did Sunday's sourdough come out of the oven flat?
  expects hypothesis
  status settled

hypothesis dead-starter
  The starter had lost its lift after three weeks unfed in the fridge.

hypothesis cold-kitchen
  The kitchen sat at sixteen degrees overnight, too cold for a full rise.

hypothesis over-proofed
  The dough was left well past its peak and collapsed when it went in the tin.
  status abandoned
  note Ruled out by the timing, but kept on the record so the next loaf can revisit it.

candidate-for why-flat-loaf
  dead-starter
  cold-kitchen
  over-proofed

observation float-test-failed
  A spoonful of starter sank in a glass of water instead of floating.
  observed-at 2026-02-15

observation dough-doubled
  The dough had visibly doubled in the bowl before it was shaped.

observation flat-crumb
  The baked loaf was dense, with a tight and slightly gummy crumb.

link float-test-failed supports dead-starter
link dough-doubled opposes over-proofed
link dead-starter answers why-flat-loaf

baker asks why-flat-loaf
  note Third flat loaf in a row, so it is worth working out rather than guessing.

baker suspects dead-starter causes flat-crumb as starter-explains-crumb
  confidence 0.7 estimated

baker accepts dead-starter
  because float-test-failed
  answers why-flat-loaf
  confidence 0.8 estimated
  note Fed the starter twice a day for three days; the next loaf rose properly.`,
  'well-water': `# well-water — a field investigation drawn as a causal graph.
#
# The scope carries the provenance once and the records nested inside it inherit:
# a member takes its container's \`source\` and \`observed-at\` unless it says otherwise.
# Note the division of labour between the relations. \`causes\` / \`enables\` / \`prevents\`
# describe how the world works and move no numbers; only the \`supports\` bundle argues.

scope kabir-hat-survey
  source district-health-survey
  observed-at 2026-05-03

  observation cases-clustered
    Nineteen of the twenty-two diarrhoeal cases live within three hundred metres of
    the north well.
    noticed-by field-nurse

  observation apron-cracked
    The concrete apron around the north well is cracked and holds standing water.

  observation latrines-uphill
    Two pit latrines sit nine metres uphill of the well, dug well below the wet-season
    water table.
    observed-at 2026-05-04

observation chlorine-absent
  Free chlorine at the well head measured zero on both visits.
  quantity 0 mg/L measured
  source district-health-survey

observation rainfall-spike
  Sixty millimetres of rain fell in the week before the first case.
  quantity 60 mm measured

claim seepage-into-well
  Surface and latrine water is reaching the well through the cracked apron.
  suspected-by field-nurse

claim well-is-contaminated
  The north well is the contaminated source behind this outbreak.

link latrines-uphill causes seepage-into-well
link apron-cracked enables seepage-into-well
link seepage-into-well causes well-is-contaminated

supports well-is-contaminated
  cases-clustered weight 0.85 measured
  chlorine-absent weight 0.6 measured

action chlorinate-and-seal
  Shock-chlorinate the well, recast the apron, and re-site both latrines downhill.
  status open

link chlorinate-and-seal prevents seepage-into-well

field-nurse noticed cases-clustered
  note Four households on one lane reported illness on the same morning.

field-nurse suspects rainfall-spike causes seepage-into-well as rain-drove-seepage
  confidence 0.5 estimated

epidemiologist infers outbreak-is-waterborne from cases-clustered well-is-contaminated
  confidence 0.82 estimated
  note Enough to act on. Stool cultures will confirm the organism, not the route.`,
  'peer-review': `# peer-review — two referees on one manuscript.
#
# The difference this file is built around: \`opposes\` says a claim is false, while
# \`undercuts\` says a step does not follow — so it targets the *link*, not the node.
# The referees also write down the paper's central claim in two different ways. Nothing
# is silently overwritten: both readings are kept on the node and \`--audit\` reports the
# \`definition-divergence\` for a human to reconcile.

focus central-claim
  kind claim
  The paper claims that the tutoring programme raised exam scores.

focus central-claim
  kind claim
  The paper claims that students who chose tutoring scored higher than those who did not.

observation scores-rose
  Mean exam score in the tutored group was 6.4 points higher.
  quantity 6.4 point measured

observation selection-not-random
  Students opted into tutoring; the comparison group was simply everyone else.

observation attendance-confounded
  The tutored students also attended twelve per cent more classes overall.

observation randomized-replication
  A neighbouring district reported the same gap after a randomized rollout.

claim programme-works
  Tutoring caused the improvement, so the programme is worth scaling.

link central-claim supports programme-works

link inference: scores-rose supports programme-works
  undercut-by referee-one

link selection-not-random undercuts inference
  weight 0.8 estimated

link attendance-confounded opposes programme-works
link randomized-replication supports programme-works
link randomized-replication opposes attendance-confounded

referee-one doubts programme-works
  confidence 0.20..0.40 estimated
  because selection-not-random
  note The effect may well be real. This design cannot show that it is.

referee-two accepts programme-works
  confidence 0.7 estimated
  because randomized-replication
  noted-by handling-editor
  note The replication is what carries it; the original comparison does not.`,
  'dating-the-codex': `# dating-the-codex — a belief that changed, with the old one still in the graph.
#
# Nothing here is deleted. The first dating is kept, marked \`superseded\`, and a
# \`revises\` edge records what replaced it and when. Because the stances are dated,
# \`--as-of 2026-01-01\` replays the document as it stood before the lab result came
# back — the earlier reading, argued in its own terms, not a redacted version of it.
#
# The two readings disagree, and the mirror says so. \`--audit\` reports a
# \`confidence-vs-status\` error: the palaeographer held the twelfth century at 0.70 and
# the radiocarbon range now defeats it. Run \`--as-of 2026-01-01 --audit\` and the
# conflict is gone. It is not that the belief was unreasonable — it is that it was
# reasonable *then*. Replay is what lets you tell those two things apart.

focus twelfth-century-dating
  kind claim
  The codex was copied in the late twelfth century.
  asserted-at 2025-09-12
  valid-during 2025-09-12..2026-02-20
  status superseded

focus fourteenth-century-dating
  kind claim
  The codex was copied between roughly 1320 and 1360.
  asserted-at 2026-02-20

link fourteenth-century-dating revises twelfth-century-dating

observation script-is-early-gothic
  The hand is an early gothic textualis, a script in use from the late twelfth
  century onward.
  observed-at 2025-09-10

observation radiocarbon-range
  Radiocarbon dating of the parchment returned 1315 to 1365 at ninety-five per cent.
  observed-at 2026-02-14
  source lab-report-4471

memory catalogue-of-1904
  The museum's 1904 catalogue also placed the codex in the twelfth century.
  source museum-catalogue-1904

link script-is-early-gothic supports twelfth-century-dating
link catalogue-of-1904 supports twelfth-century-dating
link radiocarbon-range supports fourteenth-century-dating
link radiocarbon-range opposes twelfth-century-dating

palaeographer remembers catalogue-of-1904
  note Not independent evidence — the 1904 cataloguer read the same hand we did.

palaeographer holds twelfth-century-dating
  asserted-at 2025-09-12
  confidence 0.7 estimated
  note On the script alone. Early gothic gives a lower bound, not a date.

palaeographer revises twelfth-century-dating
  asserted-at 2026-02-21
  confidence 0.05 measured
  note The radiocarbon range rules it out. Kept so the reasoning stays legible.

conservator doubts radiocarbon-range
  confidence ?
  note I cannot judge their calibration curve, so the doubt goes down without a number.`,
  'grant-panel': `# grant-panel — one award, four people, and everything that was ruled out.
#
# The criteria are a \`part-of\` collection, not evidence. Naming what you weighed must
# not make the decision look better argued than it is, and \`part-of\` carries no
# polarity, so it cannot. The withdrawn proposal is parked \`abandoned\` with its reason
# rather than deleted, and the award letter is blocked \`until\` the ethics review
# answers — which is just a \`blocks\` edge, written the way a person would say it.

scope spring-panel

  goal fund-best-science
    Award the spring grant to the proposal most likely to produce usable results.

  question which-proposal
    Which of the three proposals should take the spring award?
    expects option
    about coastal-sensors, gut-microbiome, teaching-study
    status settled

  decision spring-award
    The panel's award for the spring funding cycle.
    chosen-by panel-chair

  option coastal-sensors
    Deploy a low-cost sensor array along the estuary for a full tidal year.

  option gut-microbiome
    Sequence a longitudinal cohort of two hundred infants over eighteen months.

  option teaching-study
    Trial a new laboratory teaching sequence across three cohorts.
    status abandoned
    note Withdrawn in week two — the lead investigator moved institution.

link coastal-sensors option-of spring-award
link gut-microbiome option-of spring-award
link teaching-study option-of spring-award
link gut-microbiome answers which-proposal
link spring-award enables fund-best-science

claim panel-criteria
  What the panel agreed to weigh, before reading any of the proposals.

claim methods-are-sound
  The design can actually answer the question the applicants are asking.

claim team-can-deliver
  The team has the people and the equipment to finish inside the grant period.

claim result-is-usable
  Somebody outside the project can use the result within about two years.

part-of panel-criteria
  methods-are-sound
  team-can-deliver
  result-is-usable

observation cohort-already-recruited
  The infant cohort is recruited and consented; sequencing could start in June.

link cohort-already-recruited supports gut-microbiome

question ethics-review
  Has the committee cleared the revised infant cohort protocol?
  expects claim
  status open

action award-letter
  Send the award letter and open the project account.
  blocked-by ethics-review

link award-letter depends-on spring-award

panel-chair holds award-letter
  until ethics-review answered
  note Drafted and ready. It does not go out before the committee clears the protocol.

reviewer-a considers coastal-sensors
  confidence 0.6 estimated
  note Cheap, and a full tidal year makes the dataset reusable by other groups.

reviewer-b rejects teaching-study
  note Withdrawn by the applicant. Recorded so next cycle can see why.

stance chair-call: panel-chair chooses gut-microbiome
  confidence 0.65 estimated
  because cohort-already-recruited
  note Highest expected yield of the three, and it can start almost immediately.`,
  'orchard-water': `# orchard-water — a budget that computes itself, and checks its own units.
#
# Every number below is authored once; the \`= expr\` lines derive the rest. The parser
# does real dimensional analysis as it goes: litres per minute times minutes is litres,
# litres divided by trees is litres per tree, and a subtraction between two quantities
# of different dimension is an error rather than a plausible wrong answer. Change the
# well yield and the shortfall follows. Run it with \`--compute\`.

goal orchard-survives-summer
  Keep all twelve hundred trees alive through a dry season without buying tanker water.

observation well-yield
  Sustained yield of the bore well, measured over an hour with the flow meter.
  quantity 30 L/min measured

observation pump-window
  Hours the diesel pump can run each day on the fuel ration.
  quantity 480 min measured

observation tree-count
  Bearing trees in the two blocks under irrigation.
  quantity 1200 tree measured

assumption need-per-tree
  Water a bearing tree needs each day in a dry season to hold its fruit.
  quantity 45 L/tree estimated

claim daily-supply
  What the well and pump can actually deliver in a day.
  = well-yield * pump-window

claim supply-per-tree
  What that comes to for each tree.
  = daily-supply / tree-count

claim shortfall-per-tree
  The gap each tree is short by, every day of the season.
  = need-per-tree - supply-per-tree

link daily-supply enables orchard-survives-summer
link shortfall-per-tree prevents orchard-survives-summer
link supply-per-tree depends-on well-yield

action mulch-and-drip
  Mulch both blocks and convert the flood channels to drip lines.

observation drip-cuts-demand
  Drip irrigation with mulch cut daily demand by about a third in the neighbouring
  orchard last season.
  source grower-association-trial
  observed-at 2025-08-19

link drip-cuts-demand supports mulch-and-drip
link mulch-and-drip prevents shortfall-per-tree

grower holds mulch-and-drip
  confidence 0.6 estimated
  note A third off demand still leaves a gap, but a gap the tanker budget can cover.`,
  'evacuate-or-shelter': `# evacuate-or-shelter — the whole compute layer behind one decision.
#
# This is the capstone. \`--compute\` turns on every reading at once:
#   * expected value over the \`leads-to\` edges, \`Σ probability · payoff\`,
#   * a probability *borrowed from belief* — the \`fire-turns-away\` edge deliberately
#     omits its \`probability\`, so the engine falls back to that outcome's own derived
#     confidence, computed from the two observations arguing over it,
#   * options ranked high to low under their decision, with no winner crowned.
# The what-if is the point. One radio report is holding the whole call: delete the
# \`spotting-observed\` observation and the \`opposes\` line under it, and sheltering goes
# from 641 to 1103 — past evacuating. The engine reports that; the commander decides.

scope valley-fire

goal nobody-is-hurt
  Get through the next twelve hours with nobody in the valley injured.

decision valley-response
  Evacuate the valley now, or hold residents in place and defend the town?

option evacuate-now
  Order the valley cleared down the single river road, starting immediately.

option shelter-in-place
  Hold everyone in the town hall and the school, and defend the perimeter.

link evacuate-now option-of valley-response
link shelter-in-place option-of valley-response

# --- If we clear the valley now ---

outcome everyone-out
  The convoy clears the river road well before the fire reaches it.
  quantity 1400 person estimated

outcome road-cut-off
  The fire crosses the road mid-convoy and strands vehicles in the gorge.
  quantity 300 person estimated

link evacuate-now leads-to everyone-out
  probability 0.6 estimated

link evacuate-now leads-to road-cut-off
  probability 0.4 estimated

# --- If we shelter and defend ---
#
# The first edge below omits its probability on purpose. The engine reads the
# outcome's own derived confidence instead — the one place in the language where a
# belief turns into a likelihood, and it happens in the open rather than behind the
# scenes. Which is why the two observations underneath it decide this whole document.

outcome fire-turns-away
  The wind holds westerly, the front runs past the ridge, and the town is untouched.
  quantity 1400 person estimated

outcome town-overrun
  The fire reaches the town with everybody still inside it.
  quantity 200 person estimated

link shelter-in-place leads-to fire-turns-away

link shelter-in-place leads-to town-overrun
  probability 0.4 estimated

observation wind-forecast-westerly
  The two o'clock forecast holds the wind westerly until at least midnight.
  observed-at 2026-08-04
  source regional-met-office

link wind-forecast-westerly supports fire-turns-away
  weight 0.5 estimated

observation spotting-observed
  Crews report embers starting spot fires four hundred metres ahead of the front,
  which is how a ridge gets crossed regardless of what the wind is doing.
  observed-at 2026-08-04
  source fire-line-radio

link spotting-observed opposes fire-turns-away
  weight 0.7 measured

action open-river-road
  Close the river road to inbound traffic and run the convoy out on both lanes.

link open-river-road enables evacuate-now
link valley-response enables nobody-is-hurt

incident-commander holds valley-response
  confidence 0.55 estimated
  chosen-by incident-commander
  note Clearing the valley, on one radio report. Reassess the moment the wind turns.`,
  'inspection-standards': `# inspection-standards — a shared library, written to be imported.
#
# This document holds no findings and takes no position. It is the stable half of a
# pair: the standard that many inspections refer to. Other documents pull it in with
# \`import inspection-standards as standard\` and reference its nodes as \`standard.<id>\`
# — see \`bridge-inspection\`. A library has to be strict-clean on its own, so every node
# here earns its place through a relation, and the requirements are collected with
# \`part-of\`, which is structure and moves no confidence.

goal structures-stay-serviceable
  Every highway structure in the region stays safe to carry its rated load between
  inspections.

claim inspection-baseline
  The minimum inspection standard every highway structure is held to.

claim general-inspection-every-two-years
  A general visual inspection is carried out at most twenty-four months after the last.

claim principal-inspection-every-six-years
  A principal inspection, within touching distance of every element, every six years.

claim scour-check-after-flood
  Any structure over a watercourse is checked for scour after a flood above the
  one-in-ten-year level.

claim load-rating-on-record
  A current load rating exists on file and is re-derived whenever the deck is altered.

part-of inspection-baseline
  general-inspection-every-two-years
  principal-inspection-every-six-years
  scour-check-after-flood
  load-rating-on-record

link inspection-baseline enables structures-stay-serviceable

assumption inspection-budget
  Funded inspector time available to the region for the year.
  quantity 2400 hour estimated

link inspection-baseline depends-on inspection-budget

observation scour-caused-most-failures
  Scour is the single largest cause of bridge failure in the national record.
  source national-failure-register

link scour-caused-most-failures supports scour-check-after-flood
  weight 0.9 measured`,
  'bridge-inspection': `# bridge-inspection — one inspection, in its own dialect, against a shared standard.
#
# Two extension mechanisms at once. The \`import\` pulls in \`inspection-standards\` under
# a namespace, so this document can hang a \`depends-on\` off \`standard.<id>\` and be
# checked as a *project* — importer plus library — with the references resolving. The
# \`profile\` declares the words a bridge engineer actually uses: \`defect\` and \`remedy\`
# kinds, \`aggravates\` and \`mitigates\` relations, a \`severity\` field, a \`certifies\`
# posture. Anything the profile does not declare still warns. Same engine, domain words.
#
# One wrinkle worth knowing: a posture a profile adds is only reachable through the
# \`stance\` longhand. The readable \`<agent> <posture> …\` form is resolved against the
# twelve core postures before any profile is consulted.

import inspection-standards as standard

profile structural
  kinds defect, remedy
  relations aggravates, mitigates
  fields severity, next-inspection
  postures certifies

scope bridge-b174-november

focus deck-is-serviceable
  kind claim
  The deck can stay open to unrestricted traffic until the next principal inspection.
  next-inspection 2028-11

focus half-joint-corrosion
  kind defect
  Section loss on the reinforcement at both half joints, worst on the east abutment.
  severity high
  observed-at 2026-11-08
  source inspection-b174-11

focus drainage-blocked
  kind defect
  The deck drains are blocked, so chloride-laden runoff sits on the half joints.
  severity medium
  observed-at 2026-11-08
  source inspection-b174-11

focus clear-drains-and-wash
  kind remedy
  Clear all six drains and wash the joints down before the winter salting season.

focus cathodic-protection
  kind remedy
  Install impressed-current cathodic protection across both half joint zones.
  status open

link drainage-blocked aggravates half-joint-corrosion
link clear-drains-and-wash mitigates drainage-blocked
link cathodic-protection mitigates half-joint-corrosion
link half-joint-corrosion opposes deck-is-serviceable

observation load-rating-unchanged
  Re-derived load rating still meets the rated load with the measured section loss.
  quantity 40 tonne measured
  source load-assessment-b174

link load-rating-unchanged supports deck-is-serviceable
link deck-is-serviceable depends-on standard.load-rating-on-record
link half-joint-corrosion depends-on standard.principal-inspection-every-six-years

stance inspector certifies deck-is-serviceable
  confidence 0.45 measured
  because load-rating-unchanged
  note Open, but not unconditionally — the rating holds today and the corrosion does not.

inspector remembers b174-scour-2019
  note The 2019 flood scoured the east pier; that repair is what the joints sit on.

memory b174-scour-2019
  Scour repair to the east pier after the 2019 flood, recorded in the last principal
  inspection.
  source inspection-b174-2019

link b174-scour-2019 supports half-joint-corrosion`,
}

export const DEFAULT_EXAMPLE = 'pour-the-slab'

// Parked from the example tray: the standards library is the dull half of the import
// pair and is reachable anyway, since opening `bridge-inspection` pulls it in as a
// second file. Everything else gets a pill — with only ten examples there is room,
// and the compute capstone is worth showing. Empty this set to surface them all.
export const ADVANCED_EXAMPLES = new Set([
  'inspection-standards',
])
