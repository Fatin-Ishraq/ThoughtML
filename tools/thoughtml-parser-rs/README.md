# thoughtml-parser-rs

Reference parser for **ThoughtML v0** (see [`../../project_plan.md`](../../project_plan.md)).

It implements the full v0 pipeline from §16:

1. **parse** source text into a surface AST,
2. **normalize** (desugar) the surface AST into canonical objects,
3. **emit** canonical JSON,
4. **report diagnostics** with source line numbers,
5. **preserve** source information (the surface AST) for round-tripping.

Structural parsing requires no AI inference (§2).

## Build & test

```sh
cargo build
cargo test
```

## CLI

ThoughtML source files use the `.thml` extension.

```sh
# Emit canonical JSON (pretty by default)
thoughtml examples/incident-742.thml

# Surface AST instead of canonical objects
thoughtml --ast examples/incident-742.thml

# Read from stdin, compact JSON, fail on warnings
cat file.thml | thoughtml --strict --compact -

# Write to a file
thoughtml examples/incident-742.thml -o out.json
```

Diagnostics are written to **stderr** as `line:severity: message`. The process
exits non-zero if there are any errors (or any warnings under `--strict`).

## Examples

The [`examples/`](examples) directory holds runnable `.thml` files (all parse
with zero diagnostics):

| File                       | Shows                                                            |
|----------------------------|-----------------------------------------------------------------|
| `incident-742.thml`        | The §14 complete example: scope, noticed, question, suspects, holds |
| `multi-agent-debate.thml`  | Disagreement: suspects/doubts/accepts, supporting & undercutting links |
| `decision-record.thml`     | An ADR: considers/rejects/chooses, `because`, `until`→`blocks`   |
| `agent-memory.thml`        | Memory & inference: infers→`supports` links, remembers, revises, `?` |
| `canonical-core.thml`      | The same reasoning written directly in focus/link/stance form (§3.2) |

## Library

```rust
let r = thoughtml::parse_str(source);
if !r.diagnostics.has_errors() {
    let json = serde_json::to_string_pretty(&r.canonical)?;
}
```

## Module map

| Module        | Responsibility                                             |
|---------------|------------------------------------------------------------|
| `lex`         | Lexical helpers + the §5.7 value model                     |
| `lines`       | Line classification (§5.2–5.4): blank/comment/header/block |
| `vocab`       | Standard vocabulary + reserved words (§7, §12)             |
| `surface`     | Surface AST types (§3.1, §6)                               |
| `parser`      | Lines → surface AST (§6–7)                                 |
| `canonical`   | Canonical object model + JSON (§9)                         |
| `ids`         | Deterministic id generation with collision suffix (§11)    |
| `desugar`     | Surface AST → canonical objects (§8)                       |
| `validate`    | Cross-record reference + endpoint-kind checks (§10)        |

## Output JSON shape

The spec leaves the exact JSON serialization open (§15). This implementation
emits the canonical model as an **ordered array** of tagged objects, preserving
creation order:

```json
{ "objects": [ { "type": "focus", "id": "metric-shift", "body": "…" }, … ] }
```

Values are tagged by kind: `{ "kind": "range", "value": [0.25, 0.7] }`,
`{ "kind": "ref", "value": "deploy-cause" }`, etc. Empty `body`/`fields` are
omitted.

## Decisions where the spec is underspecified

The v0 draft fully specifies only some desugaring cases. Documented choices:

- **Field routing.** Body text annotates the created focus for focus-creating
  postures (`noticed`, `considers`, `holds`, `chooses`, `remembers`) and the
  stance otherwise (`doubts`, `accepts`, `asks`, `rejects`, `revises`).
  `confidence` → `stance.confidence`; all other fields → the stance. Body that
  lands on a stance is stored as a `note` field.
- **`until REF [STATUS]`** expands to a `REF blocks TARGET` link, with the
  optional status preserved as a field on that link (§8.4). Applied only to
  readable action headers, not to literal `stance` core records.
- **`answers`** is kept as a stance field (matching the §14 example, which shows
  no separate `answers` link).
- **Core headers** (`focus`/`link`/`stance`/`question`/`scope`) are treated as
  already-canonical and mapped with minimal processing (no action sugar).
- **Field vs. body classification.** An indented line is a field if its first
  token is a known field name, or — for the §7 "unknown field-like" case — if it
  is a lowercase identifier followed only by value-shaped tokens (these emit an
  `unknown field` warning). Everything else is body text.
- **Reference resolution** (§10) is a warning, not an error. Link endpoints are
  additionally checked to target only foci/questions/links (a hard error
  otherwise). Symbol-valued fields (`status`, `expects`) are not treated as
  references; only `because`/`answers`/`blocked-by`/`undercut-by` are resolved.
- **Comments** are recognized only as full lines whose first non-space character
  is `#` (trailing comments are not stripped, since body text is free-form).

## Robustness

The parser is hardened against malformed and hostile input:

- **Never panics or hangs** on any byte sequence — malformed headers, partial
  records, lone punctuation, fullwidth/Unicode lookalikes, and multi-megabyte
  tokens all degrade to diagnostics, never a crash (see
  `malformed_inputs_never_panic`). Id generation always terminates.
- **A leading UTF-8 BOM is stripped**, and both `\n` and `\r\n` line endings are
  accepted, so files authored on Windows parse correctly.
- **No silent data loss**: a repeated `confidence`/`expects`/`status` field
  warns rather than quietly overwriting.
- Every diagnostic carries a 1-based source line number; errors set a non-zero
  exit code (warnings too, under `--strict`).

## Not yet implemented (per §15)

Imports/namespaces, profile declarations, nested scopes, the `act`
source-preserving object, and non-English readable surfaces.
