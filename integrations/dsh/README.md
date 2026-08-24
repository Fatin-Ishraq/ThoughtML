# ThoughtML reasoning state for DeepSeek Harness

This package adds an explicit, persistent task-state ledger to the unmodified
DeepSeek Harness (DSH) agent loop. It is designed for controlled research, not
as a claim that exposing state necessarily improves an agent.

The package provides two plugins:

- `src/index.js`: matched reasoning-state context and `read`, `commit`, and
  `inspect` tools for either ThoughtML or Markdown;
- `src/metrics.js`: a separate trajectory-metrics collector that does not
  change the agent prompt or tools.

## State contract

The state is an auditable task record, not hidden chain-of-thought. The agent is
asked to record the current goal, evidence and provenance, current hypothesis,
superseded beliefs, actions and observed results, unresolved issues, next
action, and uncertainty.

Each DSH agent identity receives its own directory:

```text
<stateRoot>/<safe-session-id>/
  current.json                 authoritative revision pointer
  state.thml | state.md        observable current-state view
  history/
    <revision>-<hash>-<nonce>/
      commit.json              immutable revision metadata
      state.thml | state.md    immutable revision content
```

Revision zero is initialized and validated at session start. A commit requires
the caller's expected revision and a complete replacement document. The
candidate is size-checked and validated before a new history entry is written;
the `current.json` pointer is the commit point. Invalid, stale, oversized, and
unchanged candidates never advance that pointer. If the observable state file
is missing or edited, the store rematerializes it from the authoritative
journal. A new plugin/store instance with the same DSH agent identity and root
resumes the last committed revision.

ThoughtML commits run `thoughtml check --json --strict`. Markdown commits must
retain the fixed matched sections. ThoughtML inspection additionally reports
item, relation, and checker-conflict counts. Passing validation establishes
internal structural validity; it does not establish that recorded beliefs are
true or complete.

## DSH configuration

The current study pin is DSH `0.1.1-rc.2`, Node.js `^22.19.0 || >=24`, and
ThoughtML `0.5.0`. The package's pnpm lockfile SHA-256 is
`436682739c880d39dc45c2cee514c4c4ea3ec6c15e40703bdc430f15eba365c4`.
Use absolute file URLs and paths in a DSH patch:

```yaml
- insert:
    - id: reasoning-state
      name: 'file:///ABSOLUTE/PATH/integrations/dsh/src/index.js'
      config:
        format: 'thoughtml' # use 'markdown' for the matched control
        stateRoot: 'ABSOLUTE/PATH/to/state'
        thoughtmlBinary: 'ABSOLUTE/PATH/to/thoughtml'
        strict: true
        maxStateBytes: 65536
        maxContextChars: 12000
        historyLimit: 50
        recoveryGuidance: true
    - id: study-metrics
      name: 'file:///ABSOLUTE/PATH/integrations/dsh/src/metrics.js'
      config:
        condition: 'T'
        format: 'thoughtml'
        outputDir: 'ABSOLUTE/PATH/to/metrics'
```

The Markdown and ThoughtML conditions use the same plugin, guidance, context
timing, limits, and three tool names. Only `format`, the document syntax, and
the ThoughtML checker differ. The no-state baseline omits the reasoning-state
plugin entirely. The plugin registers ordinary DSH extension points; it does
not fork or replace the agent loop.

After a non-state tool failure, the plugin injects a concise checkpoint notice
before a blind retry. It does not force a particular action and does not inject
the tool's error content into the state automatically.

## Metrics and interpretation

The collector writes `metrics-events.jsonl` and `metrics-summary.json` separately
from the state journal. Its event file stores event type, routing metadata,
usage, tool name, outcome, and a hash of tool arguments—not raw prompts, tool
arguments, or tool output.

Directly measured fields include:

| Field | Operational definition |
|---|---|
| `modelCalls` | Count of DSH `assistant/message` events. |
| `inputTokens`, `cacheReadTokens`, `outputTokens`, `reasoningTokens` | Separate sums of each usage field reported on those events. |
| `steps`, `turns`, `toolCalls` | Counts from DSH events and tool results. |
| `repeatedActions` | Consecutive tool calls with identical name and argument hash. |
| `repeatedFailedActions` | A failed action repeated while the same failure episode remains open. |
| `recoveryEpisodesStarted` | First failed non-state tool in an open episode. |
| `recoveryEpisodesCompleted` | A later successful non-state tool closes the episode. |
| `recoveryToolDistances` | Tool-call distance from the opening failure to that success. |
| `state*` fields | Reads, inspections, commit attempts/outcomes, revision, bytes, validity, and post-failure checkpoints. |

Task success and official environment-action counts must still come from the
benchmark grader and the frozen action-accounting rules. The collector does not
infer success from a final answer. Exact-action hashes are intentionally a
narrow repetition measure; semantic repetition and goal drift require a
separate blinded trajectory annotation protocol.

Raw DSH trajectories may contain source code, prompts, and tool arguments. Keep
them access-controlled and scrubbed before publication. The state files can
also contain sensitive task context.

## Verification

From this directory:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

The package tests cover both formats, strict validation, rejected commits,
revision history, restart/resume, bounded context, visible-file repair, pointer
integrity, recovery notices, structured rendering, and aggregate-metric privacy.

The repository-level deterministic DSH lifecycle check is separate:

```powershell
Set-Location ../../study/dsh
pnpm test:offline
```

That check removes API keys, disables telemetry and online adapters, then runs
the pinned DSH headless loop under baseline, Markdown, and ThoughtML conditions.
It proves the integration and instrumentation seam without making a model call.
