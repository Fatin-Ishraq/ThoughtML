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

## Prerequisites

- **Rust** (stable) with `cargo` — install from [rustup.rs](https://rustup.rs).
- For the playground only: **Node.js 20+** and **npm**, plus the
  `wasm32-unknown-unknown` target and [`wasm-pack`](https://rustwasm.github.io/wasm-pack/).

## Running the CLI

Clone the repository and build the reference implementation:

```sh
git clone https://github.com/Fatin-Ishraq/ThoughtML.git
cd ThoughtML
cargo build --release   # builds the workspace (parser + wasm crate)
cargo test              # 171 tests; every bundled example is strict-clean
```

Run it on a document — canonical JSON goes to stdout, diagnostics to stderr.
All commands run from the repository root; `-p thoughtml` selects the parser
crate:

```sh
cargo run -p thoughtml -- examples/incident-742.thml
```

The binary is named `thoughtml`. After `cargo build --release` it lives at
`target/release/thoughtml`; put it on your `PATH` to call it anywhere:

```sh
thoughtml examples/decision-record.thml
```

See the [CLI reference](../guides/cli.md) for every flag.

## Running the playground

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
