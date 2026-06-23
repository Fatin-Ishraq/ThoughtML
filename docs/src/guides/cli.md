# CLI reference

The reference implementation's command-line tool is `thoughtml`. It reads a
`.thml` file and emits the canonical object model as JSON.

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

## Examples

```sh
# Canonical JSON + diagnostics
thoughtml examples/incident-742.thml

# The full second reading, compact, to a file
thoughtml --compute --compact -o out.json examples/why-harvard.thml

# Just the conflict report
thoughtml --audit examples/self-audit.thml

# A standalone interactive viewer — one self-contained HTML file, opens anywhere
thoughtml --html -o decision-record.html examples/decision-record.thml

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
cargo run -p thoughtml -- --compute examples/decision-ev.thml
```
