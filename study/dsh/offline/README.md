# Offline DSH integration check

`run-mock.mjs` boots the pinned DSH headless profile under three deterministic
conditions:

- `D`: DSH baseline, no study state tools;
- `M`: matched Markdown state tools; and
- `T`: matched ThoughtML state tools using the repository's ThoughtML 0.5.0
  checker.

The run inserts a local `LlmAdapter`; it does not imitate DSH outside the
harness. DSH performs its ordinary request assembly, agent loop, tool dispatch,
session events, token events, persistence, and terminal handling. A deterministic
operation fails once and then succeeds, so the run also exercises recovery
guidance and recovery metrics. The adapter returns a frozen sequence of tool
calls and final text without network access.

The runner deletes API-key variables from each child environment, disables the
DeepSeek and configurable LLM adapters, disables telemetry and DeepSeek web
search, and points every DSH home and workspace into ignored `offline/runs/`
directories. Raw mock artifacts remain local. The compact verified result is
written to `offline/results/summary.json`.

The runner also verifies that every assembled request uses only the local
`thoughtml-study-mock/deterministic-v1` route; that baseline receives no state;
that M and T receive the correct revision in DSH's dynamic context and all six
matched state-tool names; and that their deterministic `commit/read/inspect`
exercise preserves valid revision history. The newer `diff`, `explain`, and
`analyze` behavior is covered by package tests rather than adding model-like
steps to this frozen lifecycle sequence. It asserts one failure, one completed
recovery, and one post-failure state checkpoint in M and T. Aggregate metrics
are written separately from the raw ignored trajectory.

Run from `study/dsh`:

```powershell
pnpm test:offline
```

Passing this check establishes the production state plugin, recovery notice,
revision journal, context-refresh, and metric-logging seams inside real DSH. It
does not establish that DSH's native coding tools, a DeepSeek API call,
benchmark containers, or the main scientific comparison work.
