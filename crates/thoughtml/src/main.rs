//! `thoughtml` CLI: parse a ThoughtML file and emit canonical JSON, reporting
//! diagnostics with source line numbers (spec §16).

use clap::Parser;
use std::collections::{HashMap, HashSet};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

/// Parse and analyze ThoughtML documents. With no subcommand, parse a file and
/// emit the canonical JSON model (the original invocation, unchanged).
#[derive(Parser, Debug)]
#[command(name = "thoughtml", version, about, args_conflicts_with_subcommands = true)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,

    #[command(flatten)]
    run: RunArgs,
}

#[derive(clap::Subcommand, Debug)]
enum Command {
    /// Validate a document and report diagnostics (text, or `--json` with stable
    /// codes and suggested fixes); `--lint` adds opinionated modeling checks.
    Check(CheckArgs),
    /// Rewrite a document in the one canonical style (indentation, spacing, order).
    Fmt(FmtArgs),
    /// Explain why a node has its derived confidence and grounded argument status.
    Explain(ExplainArgs),
    /// Show a semantic (belief-level) diff between two documents.
    Diff(DiffArgs),
}

/// The default parse/emit invocation (`thoughtml [OPTIONS] <FILE>`).
#[derive(clap::Args, Debug)]
struct RunArgs {
    /// Input file (use `-` for stdin).
    file: Option<PathBuf>,

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

#[derive(clap::Args, Debug)]
struct CheckArgs {
    /// Input file (use `-` for stdin).
    file: PathBuf,
    /// Emit diagnostics as JSON — stable `code`, severity, line, message, `help`.
    #[arg(long)]
    json: bool,
    /// Also run opinionated modeling lints (e.g. `supports` used as a list).
    #[arg(long)]
    lint: bool,
    /// Exit non-zero on any warning, not just errors.
    #[arg(long)]
    strict: bool,
}

#[derive(clap::Args, Debug)]
struct FmtArgs {
    /// Input file.
    file: PathBuf,
    /// Do not write; exit non-zero if the file is not already formatted.
    #[arg(long)]
    check: bool,
    /// Rewrite the file in place instead of printing to stdout.
    #[arg(short, long)]
    write: bool,
}

#[derive(clap::Args, Debug)]
struct ExplainArgs {
    /// Input file (use `-` for stdin).
    file: PathBuf,
    /// The id of the node to explain (a focus, question, or link).
    id: String,
}

#[derive(clap::Args, Debug)]
struct DiffArgs {
    /// The "before" document.
    a: PathBuf,
    /// The "after" document.
    b: PathBuf,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Some(Command::Check(a)) => run_check(a),
        Some(Command::Fmt(a)) => run_fmt(a),
        Some(Command::Explain(a)) => run_explain(a),
        Some(Command::Diff(a)) => run_diff(a),
        None => run_default(cli.run),
    }
}

/// The original invocation: parse a file and emit its canonical JSON (or HTML).
fn run_default(cli: RunArgs) -> ExitCode {
    let Some(file) = cli.file.clone() else {
        eprintln!(
            "error: no input file — give a path (`thoughtml doc.thml`) or a subcommand (see `thoughtml --help`)"
        );
        return ExitCode::FAILURE;
    };

    let source = match read_source(&file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot read {}: {e}", file.display());
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
        let sources = collect_sources(&file, &source);
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
        let title = file.file_stem().and_then(|s| s.to_str());
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

/// The compute stack the analysis subcommands need so derived readings exist.
fn compute_opts() -> thoughtml::Options {
    thoughtml::Options {
        derive_confidence: true,
        argument_status: true,
        sensitivity: true,
        formulas: true,
        decision_ev: true,
        audit: true,
        ..Default::default()
    }
}

/// `thoughtml check` — validate and report diagnostics (text or `--json`).
fn run_check(args: CheckArgs) -> ExitCode {
    let source = match read_source(&args.file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot read {}: {e}", args.file.display());
            return ExitCode::FAILURE;
        }
    };
    let result = thoughtml::parse_str(&source);
    let mut diags = result.diagnostics.items.clone();
    if args.lint {
        diags.extend(thoughtml::lint::supports_as_list(&result.canonical));
    }
    diags.sort_by_key(|d| d.line);

    if args.json {
        let items: Vec<_> = diags.iter().map(thoughtml::lint::DiagnosticJson::of).collect();
        match serde_json::to_string_pretty(&items) {
            Ok(j) => println!("{j}"),
            Err(e) => {
                eprintln!("error: failed to serialize diagnostics: {e}");
                return ExitCode::FAILURE;
            }
        }
    } else {
        for d in &diags {
            println!("{}", thoughtml::lint::render_line(d));
            if let Some(h) = thoughtml::lint::help_for(&d.message) {
                println!("    help: {h}");
            }
        }
        let errs = diags
            .iter()
            .filter(|d| d.severity == thoughtml::Severity::Error)
            .count();
        let warns = diags
            .iter()
            .filter(|d| d.severity == thoughtml::Severity::Warning)
            .count();
        if diags.is_empty() {
            println!("clean — no errors, no warnings.");
        } else {
            println!("{errs} error(s), {warns} warning(s).");
        }
    }

    let has_err = diags.iter().any(|d| d.severity == thoughtml::Severity::Error);
    let has_warn = diags.iter().any(|d| d.severity == thoughtml::Severity::Warning);
    if has_err || (args.strict && has_warn) {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}

/// `thoughtml fmt` — rewrite a document in the canonical style. Refuses a document
/// with parse errors, and re-parses its own output to guarantee it did not change
/// the model before touching anything.
fn run_fmt(args: FmtArgs) -> ExitCode {
    let source = match read_source(&args.file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot read {}: {e}", args.file.display());
            return ExitCode::FAILURE;
        }
    };
    let result = thoughtml::parse_str(&source);
    if result.diagnostics.has_errors() {
        let mut ds = result.diagnostics.items.clone();
        ds.sort_by_key(|d| d.line);
        for d in &ds {
            eprintln!("{d}");
        }
        eprintln!("error: cannot format a document with parse errors");
        return ExitCode::FAILURE;
    }
    let formatted = thoughtml::fmt::format(&result.surface);
    let reparsed = thoughtml::parse_str(&formatted);
    if !canonical_eq(&result.canonical, &reparsed.canonical) {
        eprintln!("error: internal — formatting would change the model; aborting (please report)");
        return ExitCode::FAILURE;
    }

    if args.check {
        if source == formatted {
            ExitCode::SUCCESS
        } else {
            eprintln!(
                "{}: not formatted (run `thoughtml fmt -w {}`)",
                args.file.display(),
                args.file.display()
            );
            ExitCode::FAILURE
        }
    } else if args.write {
        match std::fs::write(&args.file, &formatted) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("error: failed to write {}: {e}", args.file.display());
                ExitCode::FAILURE
            }
        }
    } else {
        print!("{formatted}");
        ExitCode::SUCCESS
    }
}

fn canonical_eq(a: &thoughtml::Canonical, b: &thoughtml::Canonical) -> bool {
    matches!(
        (serde_json::to_string(a), serde_json::to_string(b)),
        (Ok(x), Ok(y)) if x == y
    )
}

/// `thoughtml explain <id>` — trace a node's derived confidence / argument status.
fn run_explain(args: ExplainArgs) -> ExitCode {
    let source = match read_source(&args.file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot read {}: {e}", args.file.display());
            return ExitCode::FAILURE;
        }
    };
    let result = thoughtml::parse_str_with(&source, compute_opts());
    match thoughtml::explain::explain(&result.canonical, &args.id) {
        Some(text) => {
            print!("{text}");
            ExitCode::SUCCESS
        }
        None => {
            eprintln!("error: no node with id `{}` in {}", args.id, args.file.display());
            ExitCode::FAILURE
        }
    }
}

/// `thoughtml diff <a> <b>` — a semantic belief-level diff between two documents.
fn run_diff(args: DiffArgs) -> ExitCode {
    let sa = match read_source(&args.a) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot read {}: {e}", args.a.display());
            return ExitCode::FAILURE;
        }
    };
    let sb = match read_source(&args.b) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot read {}: {e}", args.b.display());
            return ExitCode::FAILURE;
        }
    };
    let ra = thoughtml::parse_str_with(&sa, compute_opts());
    let rb = thoughtml::parse_str_with(&sb, compute_opts());
    let report = thoughtml::diff::diff(&ra.canonical, &rb.canonical);
    print!("{}", report.text);
    ExitCode::SUCCESS
}
