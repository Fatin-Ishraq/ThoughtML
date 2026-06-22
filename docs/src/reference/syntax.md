# Lexical structure

A ThoughtML document is a sequence of **lines**. Each line is classified before
anything else happens.

## Line kinds

| Line | Rule |
|------|------|
| **Blank** | Empty or whitespace-only. Ignored. |
| **Comment** | First non-space character is `#`. Ignored. |
| **Header** | Zero indentation, non-blank. Starts a new record. |
| **Block** | Indented (≥ 1 space), non-blank. Belongs to the open record. |

A leading UTF-8 BOM is stripped. Both `\n` and `\r\n` line endings work.

## Indentation

- Indentation is **spaces**. A **tab** in the leading whitespace is an **error**
  (`tab indentation is invalid; v0 requires spaces`).
- Block lines should be indented **two or more** spaces; one space earns a
  warning.
- A column-0 line closes every open record and starts a new top-level one.
- A more-indented line nests under the line above it; a less-indented line closes
  records back to the matching level. (Nesting only carries meaning inside a
  [scope](scopes.md) — see there.)

```thml
focus a            # header, column 0
  kind claim       # block line, indent 2 — belongs to `a`
  Some prose.      # block line — also belongs to `a`
focus b            # header again — closes `a`, opens `b`
```

## Comments

A `#` at the start of a line (after optional indentation) makes the whole line a
comment. There are no end-of-line comments — a `#` partway through a line is just
text.

```thml
# This whole line is a comment.
focus a
  This sentence has a # but it is part of the body, not a comment.
```

## Identifiers

Identifiers (record ids, relation names, references) are **lowercase
kebab-case**: they start with a lowercase letter and contain only lowercase
letters, digits, and hyphens.

```
cache-is-safe       ✓
conversation-2026-06-09   ✓
Metric              ✗  (uppercase)
-x                  ✗  (leading hyphen)
9x                  ✗  (leading digit)
```

For [imports](modules.md), an identifier may be **namespace-qualified** with
dots: `base.capacity-budget` — each dot-separated segment is itself a valid
kebab identifier.

## Values

The value after a field keyword is classified into one of a small fixed set of
forms:

| Form | Example | Notes |
|------|---------|-------|
| **Number** | `0.72`, `1`, `-3` | Plain base-10. No exponents, `inf`, or `nan`. |
| **Range** | `0.25..0.70` | `low..high`, inclusive. |
| **Unknown** | `?` | The explicit "not stated" marker. |
| **Time** | `2026-06-09`, `2026-06-14T14:05+00:00` | Loose ISO-8601. |
| **Ref** | `cache-is-safe` | A bare identifier — a reference to another record. |
| **Symbol** | `open`, `high` | Same lexical form as a ref; intent depends on the field. |
| **URI** | `uri:https://example.org/x` | A `uri:`-prefixed value. |
| **List** | `a, b, c` | Comma-separated identifiers/symbols. |
| **Text** | `"quoted string"`, or any multi-word value | Free text. A quoted string is always text. |

A single-token value is classified by the table above; a multi-word value (more
than one whitespace-separated token) is **Text**, unless it's a comma list of
identifiers. Quotes force Text.

> **Why this matters for provenance.** A value like `0.9 assumed` is two tokens,
> so it would classify as Text. ThoughtML peels a trailing
> [basis](numbers.md#provenance) keyword (`measured`/`estimated`/`assumed`) off
> first, then re-classifies the remaining `0.9` as a Number. That's how
> `confidence 0.9 assumed` parses correctly.
