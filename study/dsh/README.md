# Pinned DSH study environment

This directory isolates the DeepSeek Harness dependency used by the proposed
ThoughtML agent-utility extension.

## Candidate pin

- npm package: `@deepseek-ai/dsh@0.1.1-rc.2`
- npm integrity reported on 2026-08-24:
  `sha512-UP1UIh6q3Gme/yXRn/QL2P8IsVlv8Shpg22TRJIZPsCRWLm4CBiA1MUvXmJAfsOEETBMLAl+xWPtFw6ICsN3wg==`
- official repository `master` observed on 2026-08-24:
  `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- source-declared runtime: Node.js `^22.19.0 || >=24.0.0`
- `pnpm-lock.yaml` SHA-256:
  `6077a26dcc77502cce252c371ff4bf87e4edce085aec9077897f7e0b92315867`

The npm package and pnpm lockfile, rather than a moving branch, are the executable
dependency pin. The repository commit is provenance until its exact relationship
to the published tarball is independently established.

## Safety boundary

Installation and `--help`/`--version`/configuration inspection require no model
call and no API key. Do not place a DeepSeek key in a tracked file. A future live
run must read `DEEPSEEK_API_KEY` from an untracked `.env` or process environment
only after an explicit collection authorization.

`node_modules/`, `.dsh-home/`, `.env`, downloaded tarballs, and package-manager
logs are ignored. The lockfile remains tracked so the dependency graph and package
integrities can be reproduced.

## Offline verification

The candidate was installed with lifecycle scripts disabled:

```powershell
pnpm install --ignore-scripts --frozen-lockfile
npm run dsh:version
npm run dsh:help
npm run dsh:headless-help
```

On 2026-08-24 the version, general help, headless help, and default-config dump
all exited successfully. The installed tree reported version `0.1.1-rc.2` and
used approximately 193 MB in this workspace.

The default profile contains a telemetry exporter URL, but its configured mode
is `DSH_TELEMETRY_MODE || 'DISABLED'`. The study will still set
`DSH_TELEMETRY_MODE=DISABLED` explicitly rather than depend on a default.

The production plugin is included on this research branch at
`../../integrations/dsh`; its dependency graph is separately locked there. It
remains research infrastructure and has not been merged into the repository's
`main` branch or released as a standalone public package. The offline
deterministic composition passed for all
three study conditions. It ran the actual DSH headless loop, persisted sessions,
collected standard events, exercised a failure and recovery, refreshed the
per-step state context, and used the matched Markdown and ThoughtML
`commit/read/inspect` tools. Both formats committed revision 1, retained revision
0, and validated successfully. The separate collector recorded the failure,
recovery, token/tool totals, and post-failure checkpoint. Every request was
routed to the local mock adapter, no DeepSeek credential was present, and
telemetry was disabled. See `offline/results/summary.json` for the compact
result.

This proves the instrumentation seam, not native coding-tool behavior, benchmark
execution, or real-model scientific results. Those remain separate gates before
the pilot.

One later development-only Flash compatibility smoke also completed the
production ThoughtML read/commit/inspect sequence and produced a strict-valid
revision. Its compact, non-study record is
`diagnostics/plugin-flash-smoke-result.json`; raw artifacts remain ignored. The
call revealed separate cache-read and reasoning-token fields, which were then
added to the collector and retested.
