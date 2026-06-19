//! `thoughtml` CLI: parse a ThoughtML file and emit canonical JSON, reporting
//! diagnostics with source line numbers (spec §16).

use clap::Parser;
use std::collections::{HashMap, HashSet};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

/// Parse ThoughtML source into the canonical object model.
#[derive(Parser, Debug)]
#[command(name = "thoughtml", version, about)]
struct Cli {
    /// Input file (use `-` for stdin).
    file: PathBuf,

    /// Emit the surface AST instead of the canonical object model.
    #[arg(long)]
    ast: bool,

    /// Emit compact (single-line) JSON instead of pretty-printed.
    #[arg(long)]
    compact: bool,

    /// Treat warnings as failures for the exit code.
    #[arg(long)]
    strict: bool,

    /// Emit `Act` provenance objects for readable actions (§4.6).
    #[arg(long)]
    acts: bool,

    /// Compute `derived_confidence` by propagating evidence (§10.3).
    #[arg(long)]
    derived: bool,

    /// Compute grounded `argument_status` over the attack graph (§10.4).
    #[arg(long)]
    status: bool,

    /// Compute per-evidence `leverage` — load-bearing sensitivity (§10.5).
    #[arg(long)]
    sensitivity: bool,

    /// Evaluate `= expr` foci into `computed_quantity` (§4.8).
    #[arg(long)]
    formulas: bool,

    /// Compute decision expected values over `leads-to` / `option-of` edges (§10.6).
    #[arg(long)]
    decisions: bool,

    /// Compute the mirror's conflict report — where the structure disagrees with
    /// the author, e.g. confidence-vs-status (§10.7).
    #[arg(long)]
    audit: bool,

    /// Turn on the whole computational stack at once: `--derived --status
    /// --sensitivity --formulas --decisions --audit` (what the playground shows).
    #[arg(long)]
    compute: bool,

    /// Write JSON output to a file instead of stdout.
    #[arg(short, long)]
    out: Option<PathBuf>,
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    let source = match read_source(&cli.file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot read {}: {e}", cli.file.display());
            return ExitCode::FAILURE;
        }
    };

    // `--compute` is shorthand for the entire computational stack.
    let all = cli.compute;
    let opts = thoughtml::Options {
        emit_acts: cli.acts,
        derive_confidence: cli.derived || all,
        argument_status: cli.status || all,
        sensitivity: cli.sensitivity || all,
        formulas: cli.formulas || all,
        decision_ev: cli.decisions || all,
        audit: cli.audit || all,
    };
    // If the document imports others (§12.5), resolve them as a project from the
    // entry's directory; otherwise parse the single file.
    let result = if import_names(&source).is_empty() {
        thoughtml::parse_str_with(&source, opts)
    } else {
        let sources = collect_sources(&cli.file, &source);
        thoughtml::parse_project(&source, &sources, opts)
    };

    // Diagnostics always go to stderr, sorted by line for readability.
    let mut diags = result.diagnostics.items.clone();
    diags.sort_by_key(|d| d.line);
    for d in &diags {
        eprintln!("{d}");
    }

    let json = if cli.ast {
        to_json(&result.surface, cli.compact)
    } else {
        to_json(&result.canonical, cli.compact)
    };
    let json = match json {
        Ok(j) => j,
        Err(e) => {
            eprintln!("error: failed to serialize output: {e}");
            return ExitCode::FAILURE;
        }
    };

    if let Err(e) = write_output(cli.out.as_deref(), &json) {
        eprintln!("error: failed to write output: {e}");
        return ExitCode::FAILURE;
    }

    let errors = result.diagnostics.has_errors();
    let warn_fail = cli.strict && result.diagnostics.has_warnings();
    if errors || warn_fail {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}

fn read_source(path: &std::path::Path) -> io::Result<String> {
    if path.as_os_str() == "-" {
        let mut buf = String::new();
        io::stdin().read_to_string(&mut buf)?;
        Ok(buf)
    } else {
        std::fs::read_to_string(path)
    }
}

/// Top-level `import <name> as <ns>` declarations in `src` (column 0 only).
fn import_names(src: &str) -> Vec<String> {
    src.lines()
        .filter(|l| l.starts_with("import "))
        .filter_map(|l| {
            let toks: Vec<&str> = l.split_whitespace().collect();
            (toks.len() == 4 && toks[2] == "as").then(|| toks[1].to_string())
        })
        .collect()
}

/// Read every `.thml` the entry transitively imports, keyed by import name and
/// resolved as `<name>.thml` relative to the entry's directory. A missing file is
/// left absent so `parse_project` reports it as an unknown import.
fn collect_sources(entry: &Path, entry_src: &str) -> HashMap<String, String> {
    let dir = entry.parent().unwrap_or_else(|| Path::new("."));
    let mut sources = HashMap::new();
    let mut seen = HashSet::new();
    let mut queue = import_names(entry_src);
    while let Some(name) = queue.pop() {
        if !seen.insert(name.clone()) {
            continue;
        }
        if let Ok(src) = std::fs::read_to_string(dir.join(format!("{name}.thml"))) {
            queue.extend(import_names(&src));
            sources.insert(name, src);
        }
    }
    sources
}

fn to_json<T: serde::Serialize>(value: &T, compact: bool) -> serde_json::Result<String> {
    if compact {
        serde_json::to_string(value)
    } else {
        serde_json::to_string_pretty(value)
    }
}

fn write_output(out: Option<&std::path::Path>, json: &str) -> io::Result<()> {
    match out {
        Some(path) => std::fs::write(path, format!("{json}\n")),
        None => {
            let stdout = io::stdout();
            let mut lock = stdout.lock();
            writeln!(lock, "{json}")
        }
    }
}
