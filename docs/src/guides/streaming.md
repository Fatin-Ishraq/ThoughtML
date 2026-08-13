# Live streaming

`thoughtml stream` lets a person observe an agent's evolving reasoning without
giving the viewer access to the working directory or editor:

```sh
thoughtml stream investigation.thml
```

The command prints a temporary link and keeps running. It watches the entry file
and every transitively imported sibling `.thml` file. After an edit settles, the
same Rust reference compiler that powers the CLI recompiles the complete project
with the full mirror stack and sends the browser a new canonical snapshot.

## Local by design

This first streaming transport is hosted by the editing computer. There is no
ThoughtML account, cloud relay, upload, domain, tunnel, or third-party runtime.

- By default the listener is `127.0.0.1`, so only that computer can open it.
- `--lan` makes the viewer available to reachable devices on the same network.
- The viewer and control paths use independent operating-system-random tokens.
- The link stops working when the command exits or the computer goes offline.
- The source files remain local. The browser receives the compiled canonical
  model, diagnostics, watched file names, and semantic revision history.

The viewer token protects against casual discovery, but possession of the link
is the authorization model. On a LAN, use a trusted network and assume anyone
who obtains the link can read the model. The viewer remains strictly read-only;
the separate stop endpoint is accepted only from the host computer.

## What a viewer sees

The ordinary reasoning timeline remains the main surface. A live status badge
opens a session panel containing:

- current revision, connection state, and connected viewer count;
- the files in the active import closure;
- file-qualified diagnostics from the newest edit;
- semantic activity entries with added, changed, and removed object counts; and
- whether the graph is showing the newest model or the last valid one.

Selecting a graph node shows the exact project source that produced it, such as
`quality.thml:18`, in the same floating Reasoning Card used everywhere else.
Imported conclusions with folded module ancestry carry a quiet stacked-node
marker; **Expand reasoning** reveals those supporting nodes inside the current
graph and **Collapse reasoning** folds them away again. The **Snapshot** button
downloads the graph currently being shown as a self-contained HTML file. If the
newest edit is invalid, the download uses—and is named for—the last valid
revision, matching the graph on screen.

If an agent saves a half-written or invalid document, the current graph does not
disappear. The stream publishes the errors and keeps the most recent successful
canonical model until the source becomes valid again.

## Agent workflow

An autonomous agent can start the stream without prompts and parse one stable
JSON line from stdout:

```sh
thoughtml stream investigation.thml --json
```

```json
{"status":"streaming","viewer_url":"http://127.0.0.1:49172/s/...","bind_address":"127.0.0.1:49172","entry_file":".../investigation.thml","transport":"local-http+sse","session_id":"a1b2c3d4e5f6"}
```

Ongoing operational messages go to stderr, leaving stdout machine-readable. Add
`--events` with `--json` to receive JSON Lines events for `started`, `compiled`,
`invalid`, `unchanged`, and `stopped`. The agent continues editing normal
ThoughtML files; it does not call a publishing API.

Sessions can be discovered and stopped without remembering a process id:

```sh
thoughtml stream status
thoughtml stream status --json
thoughtml stream stop a1b2c3
thoughtml stream stop              # stop every recorded live session
```

`stop` uses an independent local control token and asks the server to shut down
cleanly. Ctrl+C remains available for an attached terminal.

## Update and performance model

The watcher polls file contents and uses a project signature to ignore unchanged
states. A change starts a 400 ms debounce window. More writes reset that window,
so a burst becomes one compilation rather than a queue of obsolete work.

Version 1 intentionally sends complete canonical snapshots. The server caps
project input at 16 MiB, request headers at 64 KiB, and concurrent connections
and viewers to bounded totals. This keeps browser
and compiler state impossible to desynchronise and gives future hosted relays a
small, versioned protocol boundary. The browser preserves its camera and selected
node when it applies a newer snapshot, and briefly highlights added or modified
nodes. Semantic diffs are computed between valid revisions for activity history.

The HTTP surface is deliberately small:

| Route | Purpose |
|---|---|
| `/s/<viewer-token>` | self-contained live viewer |
| `/api/<viewer-token>/snapshot` | current schema-versioned state |
| `/api/<viewer-token>/events` | Server-Sent Events carrying newer snapshots |
| `/health` | process health check |

The root route deliberately does not redirect to the private viewer link.

This transport can later sit behind a hosted relay without moving parsing into
the service: the CLI remains the compiler and the viewer remains a consumer of
canonical snapshots.
