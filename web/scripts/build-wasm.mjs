// Build the parser to WebAssembly.
//
// wasm-pack shells out to `cargo`, which is resolved from PATH. On a machine that
// also has a standalone (non-rustup) Rust install ahead of rustup on PATH, that
// cargo lacks the `wasm32-unknown-unknown` std and the build fails with E0463.
// rustup's cargo shim (in CARGO_HOME/bin) honours `rust-toolchain.toml` — which
// pins the wasm target — so we prepend it to PATH before invoking wasm-pack.
// Harmless on a normal rustup-only setup (the bin is already on PATH).

import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join, delimiter } from 'node:path'

const cargoBin = join(process.env.CARGO_HOME ?? join(homedir(), '.cargo'), 'bin')
const env = { ...process.env, PATH: cargoBin + delimiter + (process.env.PATH ?? '') }

const args = [
  'build',
  '../crates/thoughtml-wasm',
  '--target', 'web',
  '--out-dir', '../../web/src/wasm',
  '--out-name', 'thoughtml_wasm',
  '--release',
]

const child = spawn('wasm-pack', args, { stdio: 'inherit', env, shell: true })
child.on('exit', (code) => process.exit(code ?? 1))
child.on('error', (err) => {
  console.error(`failed to launch wasm-pack: ${err.message}`)
  process.exit(1)
})
