# Upgrading

## To v0.4.1 — the security release

**For most documents, nothing changes.** The language is the same, the CLI is the
same, the output is the same. `v0.4.1` is a drop-in upgrade and you should take it:
it fixes issues in the parser, the viewer, the `thoughtml stream` server, and the
release pipeline, and for most of them there is no configuration workaround.

Three things can bite. Only the first is likely.

### 1. A document that reported "clean" may now report an error

Two places used to accept any text and now require a well-formed value: a
`quantity`'s unit, and a question's `expects` / `status`. That is deliberate —
those strings are rendered straight back to whoever opens the document, and
unvalidated they were the route to executing script in a reader's browser.

| Now an error | Write instead |
|---|---|
| `quantity 5 $`, `quantity 4 €` | `5 USD`, `4 EUR` — the ISO code, not the symbol |
| `quantity 3 °C` | `3 degC` |
| `quantity 2 items(net)` | `2 items-net` |
| `expects Cause` | `expects cause` |
| `status In Progress` | `status in-progress` |

The rule is a character class, not a list of blessed units: letters, digits, and
`% / - _ .`, starting with a letter. Invented units keep working — `users`,
`widgets`, `story-points`, `req/s`, `USD/hour`, `m²`, `µs` all parse exactly as
before. It is symbols, spaces, brackets and capitals that no longer do.

`expects` and `status` follow the same rule ids always have: lowercase
kebab-case.

To find out before you upgrade anything important:

```sh
thoughtml check path/to/doc.thml
```

Anything that now errors is in the table above, and each fix is a one-word edit.

### 2. Sharing a stream by machine name stops working

The server now refuses requests whose `Host` is a name it does not serve. That is
the defence against DNS rebinding, where a web page points its own hostname at
your machine so the browser treats your stream as same-origin and lets the page
read it. A hostname is what makes that attack possible; an IP address does not.

So this still works:

```text
http://192.168.1.20:53318/s/<token>      ← the link the CLI prints
http://localhost:53318/s/<token>
```

and this now returns `421 Misdirected Request`:

```text
http://my-laptop:53318/s/<token>
```

If you share the link by machine name, declare it:

```sh
thoughtml stream doc.thml --lan --advertise-host my-laptop
```

Two smaller changes in the same area:

- **`/health` answers over loopback only.** A remote health probe will need to
  move to the machine itself.
- **Exposing the stream beyond your own network needs `--expose-public`.** The
  check is on where the bind actually reaches, not on what you typed: `--lan` and
  `--host 0.0.0.0` both mean "every interface I have", so on a laptop nothing
  changes, while on a cloud host the same command now stops and tells you.

### 3. Very large documents lose the leverage numbers

Past about 2 000 objects the sensitivity pass is skipped, with a warning saying
so. It re-derives the whole confidence computation once per evidence edge, which
made a large document usable as a denial of service against anything that
compiles input it did not write. Every other analysis still runs and the document
is still valid. Hand-written documents are nowhere near this; generated ones may
be.

### Also worth knowing

`thoughtml fmt` cannot preserve comments — it rebuilds the document from the
parsed model, and the model does not carry `#` lines. It used to delete them
silently on `-w`. It now refuses to rewrite a file that has comments and explains
why, rather than destroying them. A document with no comments formats as before.

### Full detail

The [CHANGELOG](https://github.com/Fatin-Ishraq/ThoughtML/blob/main/CHANGELOG.md)
lists everything, and the repository's security advisories carry the technical
write-up.
