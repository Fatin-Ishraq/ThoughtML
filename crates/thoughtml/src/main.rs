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

    /// Warn when an authored number (quantity / confidence / weight / probability)
    /// declares no basis (measured/estimated/assumed). Opt-in; off by default.
    #[arg(long)]
    strict_provenance: bool,

    /// Turn on the whole computational stack at once: `--derived --status
    /// --sensitivity --formulas --decisions --audit` (what the playground shows).
    #[arg(long)]
    compute: bool,

    /// Replay the document as it stood at a point in time (Phase A): keep only
    /// records valid at or before this timestamp. Later beliefs — and the edges
    /// that depended on them — drop out, and supersession / the audit are
    /// recomputed as of this instant. Valid-time is the default axis.
    #[arg(long, value_name = "TIME")]
    as_of: Option<String>,

    /// Replay by transaction order instead of valid-time: keep records up to and
    /// including this 0-based `seq` (the order they were recorded in the ledger).
    #[arg(long, value_name = "SEQ", conflicts_with = "as_of")]
    as_of_seq: Option<u64>,

    /// Emit a self-contained, interactive HTML view of the document instead of
    /// JSON: the canonical model is baked into a standalone graph viewer that
    /// opens in any browser — no server, no wasm. Implies the full compute stack
    /// so the lenses (evidence / argument / sensitivity / decision) are populated.
    #[arg(long)]
    html: bool,

    /// Write output to a file instead of stdout.
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

    // `--compute` is shorthand for the entire computational stack; `--html` turns
    // it on too, so a baked viewer's lenses have data to show.
    let all = cli.compute || cli.html;
    let opts = thoughtml::Options {
        emit_acts: cli.acts,
        derive_confidence: cli.derived || all,
        argument_status: cli.status || all,
        sensitivity: cli.sensitivity || all,
        formulas: cli.formulas || all,
        decision_ev: cli.decisions || all,
        audit: cli.audit || all,
        strict_provenance: cli.strict_provenance,
    };
    // An as-of replay (Phase A) projects the single document to a point in time.
    // Otherwise: if it imports others (§12.5), resolve them as a project from the
    // entry's directory; else parse the single file.
    let result = if let Some(n) = cli.as_of_seq {
        thoughtml::parse_str_as_of(&source, opts, thoughtml::AsOf::Transaction(n))
    } else if let Some(t) = cli.as_of.as_deref() {
        thoughtml::parse_str_as_of(&source, opts, thoughtml::AsOf::ValidTime(t))
    } else if import_names(&source).is_empty() {
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

    // `--html` bakes the canonical model into the standalone viewer; otherwise
    // emit JSON (the canonical model, or the surface AST under `--ast`).
    let output = if cli.html {
        // title the standalone view after the source file (the canonical model has
        // no document-level name; a flat multi-scope doc has no single root scope).
        let title = cli.file.file_stem().and_then(|s| s.to_str());
        match render_html(&result.canonical, title) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("error: failed to render HTML: {e}");
                return ExitCode::FAILURE;
            }
        }
    } else {
        let json = if cli.ast {
            to_json(&result.surface, cli.compact)
        } else {
            to_json(&result.canonical, cli.compact)
        };
        match json {
            Ok(j) => j,
            Err(e) => {
                eprintln!("error: failed to serialize output: {e}");
                return ExitCode::FAILURE;
            }
        }
    };

    if let Err(e) = write_output(cli.out.as_deref(), &output) {
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

/// Bake the canonical model into the standalone viewer, producing one
/// self-contained interactive HTML file. The viewer template (built by the web
/// package's `npm run build:viewer`, all JS/CSS inlined) carries an empty
/// `<script type="application/json" id="thoughtml-model">` tag; we fill it with
/// the compact canonical JSON. `</` is neutralized to `<\/` (still valid JSON) so
/// a node's body text can never prematurely close the script tag.
fn render_html(canon: &thoughtml::Canonical, title: Option<&str>) -> Result<String, String> {
    const TEMPLATE: &str = include_str!("../assets/viewer.html");
    const MARKER: &str = "id=\"thoughtml-model\">";
    const TITLE_MARKER: &str = "id=\"thoughtml-title\">";
    if !TEMPLATE.contains(MARKER) {
        return Err("viewer template is missing the model placeholder".into());
    }
    let json = serde_json::to_string(canon).map_err(|e| e.to_string())?;
    let safe = json.replace("</", "<\\/");
    let mut out = TEMPLATE.replace(MARKER, &format!("{MARKER}{safe}"));
    // bake the document title (file name) when the template has the slot
    if let Some(t) = title {
        let ts = t.replace("</", "<\\/");
        out = out.replace(TITLE_MARKER, &format!("{TITLE_MARKER}{ts}"));
    }
    Ok(out)
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
