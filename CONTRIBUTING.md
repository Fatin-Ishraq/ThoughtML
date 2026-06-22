# Contributing to ThoughtML

Thanks for your interest. ThoughtML is a small language with a Rust reference
implementation — issues, language ideas, and pull requests are all welcome.

## Ground rule: the parser is the source of truth

The language *is* whatever the reference parser in [`crates/thoughtml`](crates/thoughtml)
accepts and emits. The documentation in [`docs/`](docs) is derived from it. If the
docs and the parser ever disagree, the parser wins — and that disagreement is a
bug worth reporting.

## Repository layout

It's a Cargo workspace; run all cargo commands from the repository root.

| Path | What |
|------|------|
| `crates/thoughtml` | the reference parser (library + the `thoughtml` CLI) |
| `crates/thoughtml-wasm` | WebAssembly bindings — the same parser, for the browser |
| `web/` | the playground (Vite + TypeScript + CodeMirror + Cytoscape) |
| `examples/` | runnable `.thml` documents — every one must parse strict-clean |
| `docs/` | the ThoughtML Book (mdBook) |
| `assets/` | brand marks and social card |

## Building and testing

Parser, from the repo root:

```sh
cargo test                 # the whole workspace
cargo test -p thoughtml    # just the parser
cargo fmt                  # format
cargo run -p thoughtml -- examples/self-audit.thml
```

Playground:

```sh
cd web
npm install
npm run wasm   # compile the parser to wasm
npm run dev
```

> **wasm toolchain note.** `npm run wasm` must use the **rustup** toolchain (it
> has the `wasm32-unknown-unknown` target — see `rust-toolchain.toml`). If a
> standalone Rust install shadows it, put `~/.cargo/bin` early on your `PATH`.

## The conformance guard

Every file in `examples/` must parse **strict-clean** — zero errors *and* zero
warnings under the default options. The test suite enforces this. So if you add
an example it has to be clean, and if you change the language the examples have
to keep up.

## Pull requests

- Keep `cargo test` (and `npm run build`, if the playground changed) green.
- Run `cargo fmt` before committing.
- Explain the *why*, not just the *what*. ThoughtML is a language about making
  reasoning legible; the same standard applies to its history.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
