# CLI reference

The reference implementation's command-line tool is `thoughtml`. With no
subcommand it parses a `.thml` file and emits the canonical object model as JSON;
subcommands add the rest of the toolchain—validation, formatting, tracing, a
belief-level diff, the embedded language guide, and local live streaming.

```sh
thoughtml [OPTIONS] <FILE>      # parse + emit the canonical JSON model
thoughtml check <FILE>          # validate and report diagnostics
thoughtml fmt <FILE>            # rewrite in the canonical style
thoughtml explain <FILE> <ID>   # trace a node's derived confidence / status
thoughtml diff <A> <B>          # semantic (belief-level) diff of two documents
thoughtml guide [TOPIC]         # learn the bundled language, offline
thoughtml stream <FILE>         # host a live view from this computer
```

## Install

With a Rust toolchain, install the binary onto your `PATH` (`~/.cargo/bin`):

```sh
cargo install --path crates/thoughtml     # from the repository root
thoughtml --help
```

Re-run the same command after changing the parser to update the installed binary.
The result is a single self-contained executable with no runtime dependencies.

## Default invocation — parse and emit

```sh
thoughtml [OPTIONS] <FILE>
```

`<FILE>` is the input path, or `-` to read from stdin.

- **stdout** — the canonical JSON.
- **stderr** — diagnostics, sorted by source line.
- **exit code** — non-zero if there are errors (or, with `--strict`, warnings).

## Output options

| Flag | Effect |
|------|--------|
| `--ast` | Emit the surface AST instead of the canonical model. |
| `--compact` | Single-line JSON instead of pretty-printed. |
| `--html` | Emit a self-contained interactive HTML viewer instead of JSON (implies `--compute`). See [The standalone viewer](viewer.md). |
| `-o`, `--out <PATH>` | Write output to a file instead of stdout. |
| `--strict` | Treat warnings as failures for the exit code. |

## Time options (as-of replay)

Project the model to a point in time before emitting it (see
[Time and revision](../tutorial/time.md)). Dangling links and stances are cascaded
away so the projection stays coherent.

| Flag | Effect |
|------|--------|
| `--as-of <INSTANT>` | Keep only what was valid as of this date/time (valid-time axis). |
| `--as-of-seq <N>` | Keep only the first `N` recorded events (transaction order). The two are mutually exclusive. |

## Mirror options (opt-in readings)

All off by default; each adds a derived field to the output. See
[The Mirror](../mirror/index.md).

| Flag | Reading |
|------|---------|
| `--derived` | `derived_confidence` — propagate evidence (§10.3) |
| `--status` | `argument_status` — grounded `in`/`out`/`undecided` |
| `--audit` | the conflict report (`confidence-vs-status`) |
| `--sensitivity` | per-edge `leverage` |
| `--formulas` | evaluate `= expr` foci into `computed_quantity` |
| `--decisions` | decision expected value over `leads-to` / `option-of` |
| `--acts` | emit `Act` provenance objects for readable actions |
| `--strict-provenance` | warn on numbers with no `measured`/`estimated`/`assumed` basis |
| `--compute` | turn on **all** the mirror readings above (except `--acts` / `--strict-provenance`) |

## `thoughtml check` — validate

Parse and report diagnostics without emitting the model — the tight authoring gate.

```sh
thoughtml check <FILE> [--json] [--lint] [--strict]
```

| Flag | Effect |
|------|--------|
| `--json` | Emit diagnostics as JSON — a stable `code`, `severity`, `line`, `message`, and a suggested `help` fix. Built for editors, CI, and AI agents that self-correct in a loop. |
| `--lint` | Also run opinionated modeling lints. Today: the **`supports`-used-as-a-list** detector (`TML501`) — a claim with many `supports` edges and no counter-evidence is probably an enumeration that should be [`part-of`](../reference/relations.md), which would otherwise inflate its confidence. |
| `--strict` | Exit non-zero on any warning, not just errors. |

Diagnostics carry stable **codes** (`TML1xx` vocabulary, `TML2xx` references,
`TML3xx` graph coherence, `TML4xx` numbers, `TML5xx` lints) and, for the
"unknown &lt;thing&gt;" family, a nearest-spelling suggestion from the closed
vocabulary. See [Diagnostics](../reference/diagnostics.md).

```sh
thoughtml check --json reasoning.thml     # machine-readable, for an agent loop
thoughtml check --lint --strict doc.thml  # opinionated + fail on any warning (CI)
```

## `thoughtml fmt` — format

Rewrite a document in the one canonical style: two-space indentation, a blank line
between records, and a normalized field/body order. `fmt` re-parses its own output
and refuses to write if the model would change, so formatting is always safe. It
declines a document with parse errors. (Comments are not yet preserved.)

```sh
thoughtml fmt <FILE>          # print the formatted document to stdout
thoughtml fmt -w <FILE>       # rewrite the file in place
thoughtml fmt --check <FILE>  # exit non-zero if not already formatted (CI)
```

## `thoughtml explain` — trace a reading

Explain *why* a node reads the way it does: its derived confidence and grounded
argument status, the evidence for and against it (each edge's weight and
`leverage`), the stances agents hold on it, and any mirror conflict it is caught in.

```sh
thoughtml explain <FILE> <ID>
```

```text
$ thoughtml explain hiring.thml strong-hire
strong-hire  (claim)
  Alex is a strong hire.

  derived confidence : 0.500
  argument status    : out  (defeated)

  evidence in:
    opposes    take-home-failed   weight -   leverage -0.231  (source: in)
    supports   aced-interview     weight -   leverage +0.231  (source: -)

  stances:
    panel holds  confidence 0.9

  conflicts:
    [confidence-vs-status] `panel` asserts confidence 0.90 in `strong-hire`, but ... (out)

  why: defeated by attacker(s) that stand: take-home-failed.
```

## `thoughtml diff` — belief-level diff

Compare two documents *semantically*, not textually: nodes added and removed, and
for nodes in both, the changes that matter — derived confidence, grounded status
(`in`/`out`), lifecycle status, supersession, a stance's confidence, a link's
weight — plus the mirror conflicts that **appeared** or **resolved** between them.
This is version control for reasoning.

```sh
thoughtml diff <BEFORE> <AFTER>
```

```text
$ thoughtml diff before.thml after.thml
belief diff: A -> B

added (2):
  + con  (observation)
  + con-opposes-c  (link:opposes)

changed (1):
  ~ c
      confidence 0.731 -> 0.500
      status — -> out

conflicts:
  + [confidence-vs-status] `analyst` asserts confidence 0.90 in `c`, but ... (out)
```

## `thoughtml guide` — the language inside the binary

The complete AI-ready language guide is embedded from the same `llms.txt` that
ships with the packages and site:

```sh
thoughtml guide              # one-screen model and topic index
thoughtml guide relations    # one section by name, alias, or number
thoughtml guide --full       # the complete guide, suitable for an agent prompt
```

It requires no network and stays versioned with the installed binary.

## `thoughtml stream` — computer-hosted live view

Watch an entry document and its transitive sibling imports, compile the complete
project locally after each settled edit, and host a read-only live viewer:

```sh
thoughtml stream investigation.thml
```

The safe default binds to `127.0.0.1` and is viewable only on the editing
computer. Share it with another device on the same network explicitly:

```sh
thoughtml stream investigation.thml --lan
```

`--lan` does not create an internet tunnel or upload anything. The link works
only while the command and host computer are running, and the operating system's
firewall may ask whether to allow the listener. Anyone who can reach the computer
and obtains the link can read the compiled model, so use trusted networks.

The watcher coalesces rapid writes, recompiles the full project locally, and
pushes versioned canonical snapshots over Server-Sent Events. When the newest
edit is invalid, the browser receives its diagnostics while retaining the last
valid graph. Each diagnostic identifies its source file. Existing offline
commands never open a network connection.

The viewer uses the shared Reasoning Card, retains file/line provenance for
imported objects, supports inline expansion of a module conclusion's hidden
ancestry, and can download the current valid revision as standalone HTML.

Manage detached sessions locally:

```sh
thoughtml stream status             # list live and stale records
thoughtml stream status --json      # machine-readable session inventory
thoughtml stream stop <SESSION>     # id or unambiguous prefix
thoughtml stream stop               # stop every recorded live session
```

Useful options:

| Flag | Effect |
|------|--------|
| `--lan` | Listen on all interfaces and advertise a detected LAN address. |
| `--host <IP>` | Bind an explicit interface instead of the loopback default. |
| `--advertise-host <HOST>` | Override the hostname printed in the viewer URL. |
| `--port <N>` | Pick a port; `0` (default) selects a free one. |
| `--json` | Print one startup JSON object for an agent or script; ongoing logs use stderr. |
| `--events` | With `--json`, emit runtime lifecycle events as JSON Lines on stderr. |
| `--debounce-ms <N>` | Set the quiet period after edits (default: 400 ms). |
| `--strict-provenance` | Include strict number-provenance diagnostics. |

See [Live streaming](streaming.md) for the protocol and agent workflow.

## Examples

```sh
# Canonical JSON + diagnostics
thoughtml examples/triage-742.thml

# The full second reading, compact, to a file
thoughtml --compute --compact -o out.json examples/ship-or-hold.thml

# Just the conflict report
thoughtml --audit examples/ship-the-hotfix.thml

# Replay: what did the document believe as of a date?
thoughtml --as-of 2026-01-13 examples/launch-readiness.thml

# A standalone interactive viewer — one self-contained HTML file, opens anywhere
thoughtml --html -o decision-record.html examples/choose-datastore.thml

# A live view hosted by this computer until Ctrl+C
thoughtml stream examples/ship-or-hold.thml

# Enforce provenance and fail on any warning (good for CI)
thoughtml --strict --strict-provenance reasoning.thml

# Read from stdin
cat doc.thml | thoughtml -
```

## Multi-document projects

If the input file contains `import <name> as <ns>` lines, `thoughtml` resolves it
as a **project**: it reads each imported document as `<name>.thml` from the entry
file's directory, recursively, and merges everything into one model before
validating and deriving. A missing import is reported as `unknown import`; an
import cycle is reported and broken. See
[Profiles, imports, namespaces](../reference/modules.md).

## Running from source

Before installing the binary, you can run via cargo from the repository root
(`-p thoughtml` selects the parser crate):

```sh
cargo run -p thoughtml -- --compute examples/ship-or-hold.thml
```
