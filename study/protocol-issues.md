# Pre-data protocol issues

These issues were found while implementing the study and before any registered
model call. The runner must remain non-collectable until every blocking item is
resolved in the pre-registration or its deviation log.

## P01 — RESOLVED: Experiment 0 pilot arithmetic

The original text counted 744 main calls while separately describing a 60-call
Terra pilot. Version 2.1 now defines 60 discarded pilot calls plus 744 main
calls, or 804 total calls. Terra is rerun in the frozen main phase. Pilot results
are never pooled or used to decide whether to continue based on result direction.

## P02 — RESOLVED: Windows command-line limit

The full specification exceeds the Windows process command-line limit. Version
2.1 and the runner use `codex exec ... -`, write the complete prompt to stdin,
and then close stdin. Exact prompt bytes and SHA-256 are logged. This changes
transport, not content.

## P03 — RESOLVED: operational meaning of tool isolation

Codex CLI 0.144.6 exposes a shell tool and has no flag that removes it from the
model's tool list. Runs therefore use an empty neutral directory,
`--ephemeral`, `--ignore-user-config`, `--ignore-rules`,
`--sandbox read-only`, and `approval_policy="never"`. The prompt forbids every
tool call, the JSONL event stream is audited, and any run containing a tool-call
event is excluded. The protocol now says “single-shot, no tool calls permitted”
instead of claiming the tool is absent.

## P04 — RESOLVED: human review and initial authoritative freeze

Fatin Ishraq completed the human ambiguity review and approved the task corpus
unchanged on 2026-08-21, before any registered response existed. The signed
attestation is stored with the task files. The initial authoritative freeze may
therefore cover the contamination probe and Experiment 0. Any later byte change
is a deviation and requires a new immutable versioned manifest.

## P05 — [EXP1 BLOCKER] Rule J implementation version

Rule J still needs a pinned judge model, endpoint/version, prompt, pairing rule,
and parsing schema. On 2026-08-21 the user asked not to work on DeepSeek or Rule
J yet. This blocks Experiment 1 scheduling and execution, but it does not block
the contamination probe or Experiment 0. The runner enforces that boundary.

## P06 — RESOLVED: pre-data public timestamp without OSF

The author does not currently have an OSF account. The study therefore does not
claim OSF registration. Before the first registered call, the complete pre-data
state is committed publicly and marked with the annotated Git tag
`study-predata-v2.2`. This is a public timestamp and an auditable history, but
it is not an immutable third-party registration; that limitation is disclosed
in the pre-registration and eventual paper.
