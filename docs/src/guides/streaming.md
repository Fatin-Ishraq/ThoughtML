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
- The link stops working when the command exits or the computer goes offline.
- The source files remain local. The browser receives the compiled canonical
  model, diagnostics, watched file names, and semantic revision history.

The session path is unlisted, not an authentication system. On a LAN, use a
trusted network and assume anyone who obtains the link can read the model. The
viewer is strictly read-only: its server exposes GET endpoints and no publishing
or editing API.

## What a viewer sees

The ordinary reasoning timeline remains the main surface. A live status badge
opens a session panel containing:

- current revision and connection state;
- the files in the active import closure;
- diagnostics from the newest edit;
- semantic activity entries for revisions; and
- whether the graph is showing the newest model or the last valid one.

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
{"status":"streaming","viewer_url":"http://127.0.0.1:49172/s/...","bind_address":"127.0.0.1:49172","entry_file":".../investigation.thml","transport":"local-http+sse"}
```

Ongoing operational messages go to stderr, leaving stdout machine-readable. The
agent continues editing normal ThoughtML files; it does not call a publishing
API. Stop the process with the operating system's ordinary process signal or
Ctrl+C.

## Update and performance model

The watcher polls file contents and uses a project signature to ignore unchanged
states. A change starts a 400 ms debounce window. More writes reset that window,
so a burst becomes one compilation rather than a queue of obsolete work.

Version 1 intentionally sends complete canonical snapshots. This keeps browser
and compiler state impossible to desynchronise and gives future hosted relays a
small, versioned protocol boundary. The browser preserves its camera and selected
node when it applies a newer snapshot. Semantic diffs are computed between valid
revisions for the activity history.

The HTTP surface is deliberately small:

| Route | Purpose |
|---|---|
| `/s/<session>` | self-contained live viewer |
| `/api/<session>/snapshot` | current schema-versioned state |
| `/api/<session>/events` | Server-Sent Events carrying newer snapshots |
| `/health` | process health check |

This transport can later sit behind a hosted relay without moving parsing into
the service: the CLI remains the compiler and the viewer remains a consumer of
canonical snapshots.
