# Installation

ThoughtML is a **language**. Like any language, it has a *reference
implementation* — the program that reads ThoughtML source and tells you what it
means. For ThoughtML that's a parser written in Rust, plus a browser playground
built on the same parser. You don't need to know any Rust to use the language;
you only need to run the implementation.

There are two ways to run it:

- **The CLI** — read a `.thml` file, emit canonical JSON and diagnostics. This is
  the source of truth for the language.
- **The playground** — a live editor with a graph view, for exploring visually.

## Installing the CLI

The CLI is one self-contained binary named `thoughtml`. Pick whichever fits — none
of them require you to know any Rust:

**pip** — if you have [Python](https://python.org) (3.8+):

```sh
pip install thoughtml
```

**npm** — on any platform with [Node.js](https://nodejs.org) (14+):

```sh
npm install -g thoughtml
```

Both download the prebuilt binary for your platform and put `thoughtml` on your
`PATH` — no Python or Node code runs, and no compiler is needed. (`npx thoughtml
<file>` works too, without a global install.)

**Cargo** — if you have a Rust toolchain ([rustup.rs](https://rustup.rs)):

```sh
cargo install thoughtml
```

**Prebuilt binary** — download the archive for macOS, Linux, or Windows from the
[latest release](https://github.com/Fatin-Ishraq/ThoughtML/releases/latest), unpack
it, and put the `thoughtml` binary on your `PATH`.

Once it's installed, run it on a document — canonical JSON goes to stdout,
diagnostics to stderr:

```sh
thoughtml examples/choose-datastore.thml
```

See the [CLI reference](../guides/cli.md) for every flag and subcommand.

## Building from source

To hack on the parser itself, build the workspace:

```sh
git clone https://github.com/Fatin-Ishraq/ThoughtML.git
cd ThoughtML
cargo build --release   # parser + wasm crate; binary at target/release/thoughtml
cargo test              # every bundled example is strict-clean
```

From a source checkout you can run without installing — `-p thoughtml` selects the
parser crate:

```sh
cargo run -p thoughtml -- examples/triage-742.thml
```

## Export a standalone view

Turn any document into a single self-contained interactive HTML file — no server,
opens in any browser:

```sh
thoughtml examples/choose-datastore.thml --html -o datastore-decision.html
```

It carries the interactive graph with the model baked in (no wasm). See
[The standalone viewer](../guides/viewer.md).

## Running the playground

Building the playground locally needs **Node.js 20+**, a Rust toolchain with the
`wasm32-unknown-unknown` target, and [`wasm-pack`](https://rustwasm.github.io/wasm-pack/)
(or just try it live — no install — at the
[hosted playground](https://fatin-ishraq.github.io/ThoughtML/playground/)).

```sh
cd web
npm install
npm run wasm        # compile the parser to wasm (uses the rustup toolchain)
npm run dev         # start the dev server, then open the printed URL
```

The playground runs the **exact same parser** as the CLI, compiled to
WebAssembly — the browser and the command line can never drift. It also turns the
[mirror's](../mirror/index.md) opt-in readings *on* by default, so you see
derived confidence, argument status, and conflicts live as you type. See
[Using the playground](../guides/playground.md).

> **wasm toolchain gotcha.** `npm run wasm` must use the **rustup** toolchain. If
> `wasm-pack` picks up a standalone MSVC Rust instead, the build fails. Make sure
> `~/.cargo/bin` (where rustup installs) is early on your `PATH`.

## Reading this book offline

This book is written for [mdBook](https://rust-lang.github.io/mdBook/). To render
it as a searchable site:

```sh
cargo install mdbook
cd docs
mdbook serve --open    # live-reloading local site
mdbook build           # static site in docs/book/
```

Every page is also plain Markdown, so you can read it directly on GitHub without
building anything.

## Next

Write [your first document](first-document.md).
