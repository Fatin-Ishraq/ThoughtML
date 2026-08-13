//! Computer-hosted live ThoughtML sessions.
//!
//! The compiler and source files stay local. This module serves the embedded
//! standalone viewer, publishes canonical snapshots over Server-Sent Events,
//! and recompiles the complete import closure after a short debounce.

use serde::{Deserialize, Serialize};
use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const VIEWER_TEMPLATE: &str = include_str!("../assets/viewer.html");
const MODEL_MARKER: &str = "id=\"thoughtml-model\">";
const TITLE_MARKER: &str = "id=\"thoughtml-title\">";
const STREAM_MARKER: &str = "id=\"thoughtml-stream-config\">";
const SCHEMA_VERSION: u32 = 1;
const MAX_ACTIVITY: usize = 40;
const MAX_PROJECT_BYTES: u64 = 16 * 1024 * 1024;
const MAX_HEADER_BYTES: usize = 64 * 1024;
const MAX_CONNECTIONS: usize = 64;
const MAX_SSE_CLIENTS: usize = 24;

#[derive(clap::Args, Debug)]
pub(crate) struct StreamArgs {
    /// Entry ThoughtML file. Its transitive sibling imports are watched too.
    pub(crate) file: Option<PathBuf>,

    #[command(subcommand)]
    action: Option<StreamAction>,

    /// Port to listen on. Zero asks the operating system for a free port.
    #[arg(long, default_value_t = 0)]
    port: u16,

    /// Listen on every network interface and print a LAN-usable link.
    #[arg(long, conflicts_with = "host")]
    lan: bool,

    /// Advanced bind address. The safe default is 127.0.0.1.
    #[arg(long, value_name = "IP", conflicts_with = "lan")]
    host: Option<IpAddr>,

    /// Hostname or IP printed in the viewer URL (useful with --host 0.0.0.0).
    #[arg(long, value_name = "HOST")]
    advertise_host: Option<String>,

    /// Emit one machine-readable startup object on stdout; logs stay on stderr.
    #[arg(long)]
    json: bool,

    /// Emit machine-readable runtime events as JSON Lines on stderr.
    #[arg(long, requires = "json")]
    events: bool,

    /// Also run strict numeric-provenance diagnostics during live compilation.
    #[arg(long)]
    strict_provenance: bool,

    /// Quiet period after the newest file change before compiling.
    #[arg(long, default_value_t = 400, value_name = "MILLISECONDS")]
    debounce_ms: u64,

    /// File polling interval. Configurable for tests and unusual filesystems.
    #[arg(long, default_value_t = 200, value_name = "MILLISECONDS", hide = true)]
    poll_ms: u64,
}

#[derive(clap::Subcommand, Debug)]
enum StreamAction {
    /// List locally recorded stream sessions and whether they are reachable.
    Status {
        /// Emit a JSON array for scripts and agents.
        #[arg(long)]
        json: bool,
    },
    /// Gracefully stop one session (by id/prefix), or every local session.
    Stop {
        /// Session id or unambiguous prefix. Omit to stop every live session.
        session: Option<String>,
        /// Emit a JSON result.
        #[arg(long)]
        json: bool,
    },
}

#[derive(Clone, Default, Serialize)]
struct ChangeSummary {
    added: Vec<String>,
    removed: Vec<String>,
    modified: Vec<String>,
    conflicts_appeared: usize,
    conflicts_resolved: usize,
    files: Vec<String>,
}

#[derive(Clone, Serialize)]
struct Activity {
    sequence: u64,
    at_ms: u128,
    kind: &'static str,
    summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    changes: Option<ChangeSummary>,
}

#[derive(Clone, Serialize)]
struct Snapshot {
    schema_version: u32,
    sequence: u64,
    title: String,
    source_state: &'static str,
    showing_last_valid: bool,
    updated_at_ms: u128,
    canonical: Option<thoughtml::Canonical>,
    diagnostics: Vec<thoughtml::Diagnostic>,
    watched_files: Vec<String>,
    activity: Vec<Activity>,
    connected_viewers: usize,
}

struct SharedState {
    snapshot: Mutex<Snapshot>,
    changed: Condvar,
    shutdown: AtomicBool,
    viewers: AtomicUsize,
    connections: AtomicUsize,
}

struct ProjectRead {
    entry_path: PathBuf,
    entry: String,
    sources: HashMap<String, String>,
    watched: Vec<PathBuf>,
    file_hashes: HashMap<String, u64>,
    changed_files: Vec<String>,
    signature: u64,
}

#[derive(Serialize)]
struct Startup<'a> {
    status: &'static str,
    viewer_url: &'a str,
    bind_address: String,
    entry_file: String,
    transport: &'static str,
    session_id: &'a str,
}

#[derive(Clone, Serialize, Deserialize)]
struct SessionRecord {
    schema_version: u32,
    session_id: String,
    viewer_url: String,
    control_addr: String,
    control_token: String,
    entry_file: String,
    started_at_ms: u128,
    pid: u32,
}

#[derive(Clone, Serialize)]
struct SessionStatus {
    session_id: String,
    viewer_url: String,
    entry_file: String,
    pid: u32,
    started_at_ms: u128,
    reachable: bool,
}

struct RuntimeLog {
    json_events: bool,
}

impl RuntimeLog {
    fn event(&self, event: &str, fields: serde_json::Value) {
        if self.json_events {
            let mut value = fields;
            if let Some(object) = value.as_object_mut() {
                object.insert("event".into(), serde_json::Value::String(event.into()));
            }
            eprintln!("{value}");
        }
    }
}

pub(crate) fn run(args: StreamArgs) -> ExitCode {
    if let Some(action) = args.action {
        return run_action(action);
    }
    if args.debounce_ms == 0 || args.poll_ms == 0 {
        eprintln!("error: --debounce-ms and --poll-ms must be greater than zero");
        return ExitCode::FAILURE;
    }

    let Some(file) = args.file else {
        eprintln!("error: provide a ThoughtML file, or use `stream status` / `stream stop`");
        return ExitCode::FAILURE;
    };
    let entry = match file.canonicalize() {
        Ok(path) if path.is_file() => path,
        Ok(path) => {
            eprintln!("error: {} is not a file", path.display());
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("error: cannot open {}: {e}", file.display());
            return ExitCode::FAILURE;
        }
    };

    let bind_ip = args.host.unwrap_or({
        if args.lan {
            IpAddr::V4(Ipv4Addr::UNSPECIFIED)
        } else {
            IpAddr::V4(Ipv4Addr::LOCALHOST)
        }
    });
    let listener = match TcpListener::bind(SocketAddr::new(bind_ip, args.port)) {
        Ok(listener) => listener,
        Err(e) => {
            eprintln!(
                "error: cannot start stream server on {bind_ip}:{}: {e}",
                args.port
            );
            return ExitCode::FAILURE;
        }
    };
    if let Err(e) = listener.set_nonblocking(true) {
        eprintln!("error: cannot configure stream server: {e}");
        return ExitCode::FAILURE;
    }
    let bound = match listener.local_addr() {
        Ok(addr) => addr,
        Err(e) => {
            eprintln!("error: cannot inspect stream server address: {e}");
            return ExitCode::FAILURE;
        }
    };

    let project = match read_project(&entry) {
        Ok(project) => project,
        Err(e) => {
            eprintln!("error: cannot read {}: {e}", entry.display());
            return ExitCode::FAILURE;
        }
    };
    let title = entry
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("ThoughtML stream")
        .to_string();
    let viewer_token = match secure_token(24) {
        Ok(token) => token,
        Err(e) => {
            eprintln!("error: cannot create a secure stream token: {e}");
            return ExitCode::FAILURE;
        }
    };
    let control_token = match secure_token(32) {
        Ok(token) => token,
        Err(e) => {
            eprintln!("error: cannot create a secure control token: {e}");
            return ExitCode::FAILURE;
        }
    };
    let session = viewer_token[..12].to_string();
    let initial = compile_project(
        &project,
        &title,
        args.strict_provenance,
        None,
        1,
        Vec::new(),
    );
    let shared = Arc::new(SharedState {
        snapshot: Mutex::new(initial),
        changed: Condvar::new(),
        shutdown: AtomicBool::new(false),
        viewers: AtomicUsize::new(0),
        connections: AtomicUsize::new(0),
    });

    let shutdown_state = Arc::clone(&shared);
    if let Err(e) = ctrlc::set_handler(move || {
        shutdown_state.shutdown.store(true, Ordering::SeqCst);
        shutdown_state.changed.notify_all();
    }) {
        eprintln!("error: cannot install Ctrl+C handler: {e}");
        return ExitCode::FAILURE;
    }

    let advertised = args.advertise_host.unwrap_or_else(|| {
        if args.lan || bind_ip.is_unspecified() {
            discover_lan_ip()
                .map(|ip| ip.to_string())
                .unwrap_or_else(|| "localhost".to_string())
        } else if bind_ip.is_ipv6() {
            format!("[{bind_ip}]")
        } else {
            bind_ip.to_string()
        }
    });
    let viewer_url = format!("http://{advertised}:{}/s/{viewer_token}", bound.port());
    let control_host = if bound.is_ipv6() {
        "[::1]"
    } else {
        "127.0.0.1"
    };
    let record = SessionRecord {
        schema_version: SCHEMA_VERSION,
        session_id: session.clone(),
        viewer_url: viewer_url.clone(),
        control_addr: format!("{control_host}:{}", bound.port()),
        control_token: control_token.clone(),
        entry_file: entry.display().to_string(),
        started_at_ms: now_ms(),
        pid: std::process::id(),
    };
    let state_path = match write_session_record(&record) {
        Ok(path) => path,
        Err(e) => {
            eprintln!("error: cannot record local stream session: {e}");
            return ExitCode::FAILURE;
        }
    };
    let startup = Startup {
        status: "streaming",
        viewer_url: &viewer_url,
        bind_address: bound.to_string(),
        entry_file: entry.display().to_string(),
        transport: "local-http+sse",
        session_id: &session,
    };
    if args.json {
        match serde_json::to_string(&startup) {
            Ok(json) => println!("{json}"),
            Err(e) => {
                eprintln!("error: cannot serialize startup result: {e}");
                return ExitCode::FAILURE;
            }
        }
        io::stdout().flush().ok();
    } else {
        println!("ThoughtML live session started");
        println!("View:     {viewer_url}");
        println!("Watching: {}", entry.display());
        println!("Stop:     Ctrl+C");
        if args.lan || !bind_ip.is_loopback() {
            println!("Access:   protected by an unguessable link on this trusted local network");
            println!("Privacy:  compiled reasoning, diagnostics, and file names are shared");
        } else {
            println!("Access:   this computer only (use --lan to share on your local network)");
        }
        io::stdout().flush().ok();
    }

    let log = RuntimeLog {
        json_events: args.events,
    };
    log.event(
        "started",
        serde_json::json!({ "session_id": session, "viewer_url": viewer_url }),
    );

    let poll = Duration::from_millis(args.poll_ms);
    let debounce = Duration::from_millis(args.debounce_ms);
    let mut last_poll = Instant::now();
    let mut known_signature = project.signature;
    let mut known_hashes = project.file_hashes.clone();
    let mut pending_since: Option<Instant> = None;
    let mut pending_project: Option<ProjectRead> = None;
    let mut pending_error: Option<(Instant, String)> = None;
    let mut reported_error: Option<String> = None;

    while !shared.shutdown.load(Ordering::SeqCst) {
        loop {
            match listener.accept() {
                Ok((socket, _)) => {
                    if shared.connections.load(Ordering::Relaxed) >= MAX_CONNECTIONS {
                        reject_busy(socket);
                        continue;
                    }
                    shared.connections.fetch_add(1, Ordering::Relaxed);
                    let state = Arc::clone(&shared);
                    let view_secret = viewer_token.clone();
                    let control_secret = control_token.clone();
                    thread::spawn(move || {
                        handle_connection(socket, &view_secret, &control_secret, state.clone());
                        state.connections.fetch_sub(1, Ordering::Relaxed);
                    });
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => break,
                Err(e) => eprintln!("stream: connection error: {e}"),
            }
        }

        if last_poll.elapsed() >= poll {
            last_poll = Instant::now();
            match read_project(&entry) {
                Ok(next) if next.signature != known_signature => {
                    known_signature = next.signature;
                    let mut next = next;
                    next.changed_files = changed_files(&known_hashes, &next.file_hashes);
                    known_hashes = next.file_hashes.clone();
                    pending_project = Some(next);
                    pending_since = Some(Instant::now());
                    pending_error = None;
                    reported_error = None;
                }
                Ok(_) => {
                    pending_error = None;
                    reported_error = None;
                }
                Err(e) => {
                    let message = e.to_string();
                    if reported_error.as_ref() != Some(&message)
                        && pending_error
                            .as_ref()
                            .is_none_or(|(_, old)| old != &message)
                    {
                        pending_error = Some((Instant::now(), message));
                    }
                }
            }
        }

        if pending_since.is_some_and(|at| at.elapsed() >= debounce) {
            if let Some(project) = pending_project.take() {
                publish_compile(&shared, &project, &title, args.strict_provenance, &log);
            }
            pending_since = None;
        }

        if pending_error
            .as_ref()
            .is_some_and(|(at, _)| at.elapsed() >= debounce)
        {
            let (_, message) = pending_error.take().unwrap();
            known_signature = u64::MAX;
            publish_read_error(&shared, &entry, &message, &log);
            reported_error = Some(message);
        }

        thread::sleep(Duration::from_millis(20));
    }

    shared.changed.notify_all();
    log.event("stopped", serde_json::json!({ "session_id": session }));
    let _ = std::fs::remove_file(&state_path);
    let drain_deadline = Instant::now() + Duration::from_secs(2);
    while shared.viewers.load(Ordering::SeqCst) > 0 && Instant::now() < drain_deadline {
        thread::sleep(Duration::from_millis(20));
    }
    ExitCode::SUCCESS
}

fn publish_compile(
    shared: &SharedState,
    project: &ProjectRead,
    title: &str,
    strict: bool,
    log: &RuntimeLog,
) {
    let previous = shared.snapshot.lock().unwrap().clone();
    let next = compile_project(
        project,
        title,
        strict,
        previous.canonical.as_ref(),
        previous.sequence + 1,
        previous.activity.clone(),
    );
    let status = next.source_state;
    let sequence = next.sequence;
    let errors = next
        .diagnostics
        .iter()
        .filter(|d| d.severity == thoughtml::Severity::Error)
        .count();
    if next
        .activity
        .last()
        .is_some_and(|activity| activity.kind == "unchanged")
        && next.watched_files == previous.watched_files
        && diagnostics_equal(&next.diagnostics, &previous.diagnostics)
    {
        log.event(
            "unchanged",
            serde_json::json!({ "sequence": previous.sequence }),
        );
        return;
    }
    let objects = next.canonical.as_ref().map_or(0, |c| c.objects.len());
    let showing_revision = next.showing_last_valid.then(|| {
        previous
            .activity
            .iter()
            .rev()
            .find(|activity| activity.kind == "revision" || activity.kind == "started")
            .map(|activity| activity.sequence)
            .unwrap_or(previous.sequence)
    });
    *shared.snapshot.lock().unwrap() = next;
    shared.changed.notify_all();
    if status == "valid" {
        eprintln!("stream: published revision {sequence}");
        log.event(
            "compiled",
            serde_json::json!({ "revision": sequence, "objects": objects, "errors": 0 }),
        );
    } else {
        eprintln!(
            "stream: revision {sequence} has {errors} error(s); keeping the last valid graph"
        );
        log.event(
            "invalid",
            serde_json::json!({ "revision": sequence, "errors": errors, "showing_revision": showing_revision }),
        );
    }
}

fn compile_project(
    project: &ProjectRead,
    title: &str,
    strict: bool,
    previous_valid: Option<&thoughtml::Canonical>,
    sequence: u64,
    mut activity: Vec<Activity>,
) -> Snapshot {
    let mut opts = super::compute_opts();
    opts.strict_provenance = strict;
    let result = if project.sources.is_empty() && import_names(&project.entry).is_empty() {
        thoughtml::parse_str_with(&project.entry, opts)
    } else {
        thoughtml::parse_project(&project.entry, &project.sources, opts)
    };
    let valid = !result.diagnostics.has_errors();
    let now = now_ms();
    let canonical = if valid {
        Some(result.canonical.clone())
    } else {
        previous_valid.cloned()
    };
    let item = if valid {
        match previous_valid {
            Some(previous) => {
                let diff = thoughtml::diff::diff(previous, &result.canonical);
                let changes = ChangeSummary {
                    added: diff.added_ids,
                    removed: diff.removed_ids,
                    modified: diff.modified_ids,
                    conflicts_appeared: diff.conflicts_appeared,
                    conflicts_resolved: diff.conflicts_resolved,
                    files: project.changed_files.clone(),
                };
                let summary = summarize_changes(&changes);
                Activity {
                    sequence,
                    at_ms: now,
                    kind: if diff.changed {
                        "revision"
                    } else {
                        "unchanged"
                    },
                    summary: if diff.changed {
                        summary
                    } else {
                        "Source changed; reasoning model unchanged".to_string()
                    },
                    detail: diff.changed.then_some(diff.text),
                    changes: diff.changed.then_some(changes),
                }
            }
            None => Activity {
                sequence,
                at_ms: now,
                kind: "started",
                summary: format!(
                    "Stream started with {} objects across {} file(s)",
                    result.canonical.objects.len(),
                    project.watched.len()
                ),
                detail: None,
                changes: None,
            },
        }
    } else {
        let errors = result
            .diagnostics
            .items
            .iter()
            .filter(|d| d.severity == thoughtml::Severity::Error)
            .count();
        Activity {
            sequence,
            at_ms: now,
            kind: "invalid",
            summary: if canonical.is_some() {
                format!("Latest edit has {errors} error(s); showing the last valid revision")
            } else {
                format!("Latest edit has {errors} error(s); waiting for the first valid revision")
            },
            detail: None,
            changes: None,
        }
    };
    activity.push(item);
    if activity.len() > MAX_ACTIVITY {
        activity.drain(0..activity.len() - MAX_ACTIVITY);
    }

    Snapshot {
        schema_version: SCHEMA_VERSION,
        sequence,
        title: title.to_string(),
        source_state: if valid { "valid" } else { "invalid" },
        showing_last_valid: !valid && canonical.is_some(),
        updated_at_ms: now,
        canonical,
        diagnostics: map_diagnostic_sources(result.diagnostics.items, project),
        watched_files: display_paths(&project.watched, Some(&project.entry_path)),
        activity,
        connected_viewers: 0,
    }
}

fn read_project(entry: &Path) -> io::Result<ProjectRead> {
    let entry_source = std::fs::read_to_string(entry)?;
    if entry_source.len() as u64 > MAX_PROJECT_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "project exceeds the 16 MiB stream limit",
        ));
    }
    let dir = entry.parent().unwrap_or_else(|| Path::new("."));
    let mut sources = HashMap::new();
    let mut watched = vec![entry.to_path_buf()];
    let mut seen = HashSet::new();
    let mut queue = import_names(&entry_source);
    let mut hasher = DefaultHasher::new();
    let mut file_hashes = HashMap::new();
    let mut total_bytes = entry_source.len() as u64;
    entry.hash(&mut hasher);
    entry_source.hash(&mut hasher);
    file_hashes.insert(
        entry
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("entry.thml")
            .to_string(),
        hash_value(&entry_source),
    );
    while let Some(name) = queue.pop() {
        if !seen.insert(name.clone()) {
            continue;
        }
        let path = dir.join(format!("{name}.thml"));
        watched.push(path.clone());
        path.hash(&mut hasher);
        match std::fs::read_to_string(&path) {
            Ok(source) => {
                total_bytes = total_bytes.saturating_add(source.len() as u64);
                if total_bytes > MAX_PROJECT_BYTES {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "project exceeds the 16 MiB stream limit",
                    ));
                }
                source.hash(&mut hasher);
                file_hashes.insert(format!("{name}.thml"), hash_value(&source));
                queue.extend(import_names(&source));
                sources.insert(name, source);
            }
            Err(e) => e.kind().hash(&mut hasher),
        }
    }
    watched.sort();
    watched.dedup();
    Ok(ProjectRead {
        entry_path: entry.to_path_buf(),
        entry: entry_source,
        sources,
        watched,
        file_hashes,
        changed_files: Vec::new(),
        signature: hasher.finish(),
    })
}

fn import_names(source: &str) -> Vec<String> {
    source
        .lines()
        .filter(|line| line.starts_with("import "))
        .filter_map(|line| {
            let tokens: Vec<&str> = line.split_whitespace().collect();
            (tokens.len() == 4 && tokens[2] == "as").then(|| tokens[1].to_string())
        })
        .collect()
}

fn display_paths(paths: &[PathBuf], entry: Option<&PathBuf>) -> Vec<String> {
    let base = entry.and_then(|p| p.parent());
    paths
        .iter()
        .map(|path| {
            base.and_then(|b| path.strip_prefix(b).ok())
                .unwrap_or(path)
                .display()
                .to_string()
        })
        .collect()
}

fn hash_value(value: &impl Hash) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn changed_files(old: &HashMap<String, u64>, new: &HashMap<String, u64>) -> Vec<String> {
    let mut names: HashSet<String> = old.keys().chain(new.keys()).cloned().collect();
    let mut changed: Vec<String> = names
        .drain()
        .filter(|name| old.get(name) != new.get(name))
        .collect();
    changed.sort();
    changed
}

fn summarize_changes(changes: &ChangeSummary) -> String {
    let mut parts = Vec::new();
    if !changes.added.is_empty() {
        parts.push(format!("{} added", changes.added.len()));
    }
    if !changes.modified.is_empty() {
        parts.push(format!("{} changed", changes.modified.len()));
    }
    if !changes.removed.is_empty() {
        parts.push(format!("{} removed", changes.removed.len()));
    }
    if changes.conflicts_appeared > 0 {
        parts.push(format!(
            "{} conflict(s) appeared",
            changes.conflicts_appeared
        ));
    }
    if changes.conflicts_resolved > 0 {
        parts.push(format!(
            "{} conflict(s) resolved",
            changes.conflicts_resolved
        ));
    }
    if parts.is_empty() {
        parts.push("Reasoning model refreshed".to_string());
    }
    if !changes.files.is_empty() {
        parts.push(changes.files.join(", "));
    }
    parts.join(" · ")
}

fn map_diagnostic_sources(
    diagnostics: Vec<thoughtml::Diagnostic>,
    project: &ProjectRead,
) -> Vec<thoughtml::Diagnostic> {
    let entry_name = project
        .entry_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("entry.thml")
        .to_string();
    diagnostics
        .into_iter()
        .map(|mut diagnostic| {
            diagnostic.source = Some(match diagnostic.source.as_deref() {
                Some("entry") | None => entry_name.clone(),
                Some(source) if project.sources.contains_key(source) => format!("{source}.thml"),
                Some(source) => source.to_string(),
            });
            diagnostic
        })
        .collect()
}

fn diagnostics_equal(a: &[thoughtml::Diagnostic], b: &[thoughtml::Diagnostic]) -> bool {
    serde_json::to_vec(a).ok() == serde_json::to_vec(b).ok()
}

fn publish_read_error(shared: &SharedState, entry: &Path, message: &str, log: &RuntimeLog) {
    let previous = shared.snapshot.lock().unwrap().clone();
    let sequence = previous.sequence + 1;
    let source = entry
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("entry.thml")
        .to_string();
    let diagnostic = thoughtml::Diagnostic {
        source: Some(source.clone()),
        severity: thoughtml::Severity::Error,
        line: 0,
        message: format!("cannot read source: {message}"),
    };
    let mut activity = previous.activity;
    activity.push(Activity {
        sequence,
        at_ms: now_ms(),
        kind: "invalid",
        summary: format!("Cannot read {source}; showing the last valid revision"),
        detail: Some(message.to_string()),
        changes: None,
    });
    if activity.len() > MAX_ACTIVITY {
        activity.drain(0..activity.len() - MAX_ACTIVITY);
    }
    let snapshot = Snapshot {
        schema_version: SCHEMA_VERSION,
        sequence,
        title: previous.title,
        source_state: "invalid",
        showing_last_valid: previous.canonical.is_some(),
        updated_at_ms: now_ms(),
        canonical: previous.canonical,
        diagnostics: vec![diagnostic],
        watched_files: previous.watched_files,
        activity,
        connected_viewers: shared.viewers.load(Ordering::Relaxed),
    };
    *shared.snapshot.lock().unwrap() = snapshot;
    shared.changed.notify_all();
    eprintln!("stream: revision {sequence} cannot be read; keeping the last valid graph");
    log.event(
        "invalid",
        serde_json::json!({ "revision": sequence, "errors": 1, "source": source }),
    );
}

fn secure_token(bytes: usize) -> io::Result<String> {
    let mut random = vec![0_u8; bytes];
    getrandom::fill(&mut random)
        .map_err(|e| io::Error::other(format!("operating-system randomness failed: {e}")))?;
    Ok(random.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn session_dir() -> PathBuf {
    std::env::temp_dir().join("thoughtml-stream-sessions")
}

fn write_session_record(record: &SessionRecord) -> io::Result<PathBuf> {
    let dir = session_dir();
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.json", record.session_id));
    let temporary = dir.join(format!(".{}.{}.tmp", record.session_id, std::process::id()));
    let bytes = serde_json::to_vec_pretty(record).map_err(io::Error::other)?;
    std::fs::write(&temporary, bytes)?;
    std::fs::rename(&temporary, &path)?;
    Ok(path)
}

fn load_session_records() -> io::Result<Vec<SessionRecord>> {
    let dir = session_dir();
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let mut records = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }
        match std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<SessionRecord>(&bytes).ok())
        {
            Some(record) if record.schema_version == SCHEMA_VERSION => records.push(record),
            _ => {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    records.sort_by_key(|record| record.started_at_ms);
    Ok(records)
}

fn request_local(record: &SessionRecord, method: &str, path: &str) -> io::Result<String> {
    let address: SocketAddr = record
        .control_addr
        .parse()
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e))?;
    if !address.ip().is_loopback() {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "recorded stream control address is not loopback",
        ));
    }
    let mut socket = TcpStream::connect_timeout(&address, Duration::from_millis(350))?;
    socket.set_read_timeout(Some(Duration::from_secs(2)))?;
    socket.set_write_timeout(Some(Duration::from_secs(2)))?;
    write!(
        socket,
        "{method} {path} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
        record.control_addr
    )?;
    socket.flush()?;
    let mut response = String::new();
    socket.read_to_string(&mut response)?;
    Ok(response)
}

fn record_reachable(record: &SessionRecord) -> bool {
    request_local(record, "GET", "/health")
        .is_ok_and(|response| response.starts_with("HTTP/1.1 200"))
}

fn run_action(action: StreamAction) -> ExitCode {
    let records = match load_session_records() {
        Ok(records) => records,
        Err(e) => {
            eprintln!("error: cannot inspect local stream sessions: {e}");
            return ExitCode::FAILURE;
        }
    };
    match action {
        StreamAction::Status { json } => {
            let mut statuses = Vec::new();
            for record in records {
                let reachable = record_reachable(&record);
                if !reachable {
                    let _ = std::fs::remove_file(
                        session_dir().join(format!("{}.json", record.session_id)),
                    );
                }
                statuses.push(SessionStatus {
                    session_id: record.session_id,
                    viewer_url: record.viewer_url,
                    entry_file: record.entry_file,
                    pid: record.pid,
                    started_at_ms: record.started_at_ms,
                    reachable,
                });
            }
            if json {
                println!(
                    "{}",
                    serde_json::to_string(&statuses).unwrap_or_else(|_| "[]".into())
                );
            } else if statuses.is_empty() {
                println!("No local ThoughtML stream sessions recorded.");
            } else {
                for status in statuses {
                    println!(
                        "{}  {:7}  {}\n  {}",
                        status.session_id,
                        if status.reachable { "live" } else { "stale" },
                        status.entry_file,
                        status.viewer_url
                    );
                }
            }
            ExitCode::SUCCESS
        }
        StreamAction::Stop { session, json } => {
            let mut candidates: Vec<_> = records
                .into_iter()
                .filter(|record| {
                    session
                        .as_ref()
                        .is_none_or(|needle| record.session_id.starts_with(needle))
                })
                .collect();
            if session.is_some() && candidates.len() > 1 {
                eprintln!("error: session prefix is ambiguous; provide more characters");
                return ExitCode::FAILURE;
            }
            if candidates.is_empty() {
                eprintln!("error: no matching local stream session");
                return ExitCode::FAILURE;
            }
            let mut stopped = Vec::new();
            let mut failed = Vec::new();
            for record in candidates.drain(..) {
                let path = format!("/control/{}/stop", record.control_token);
                if request_local(&record, "POST", &path)
                    .is_ok_and(|response| response.starts_with("HTTP/1.1 202"))
                {
                    stopped.push(record.session_id);
                } else {
                    failed.push(record.session_id);
                }
            }
            if json {
                println!(
                    "{}",
                    serde_json::json!({ "stopped": stopped, "failed": failed })
                );
            } else {
                for session in &stopped {
                    println!("Stopped ThoughtML stream {session}.");
                }
                for session in &failed {
                    eprintln!("error: could not stop ThoughtML stream {session}");
                }
            }
            if failed.is_empty() {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct Request {
    method: String,
    path: String,
}

fn handle_connection(
    mut socket: TcpStream,
    viewer_token: &str,
    control_token: &str,
    shared: Arc<SharedState>,
) {
    socket.set_read_timeout(Some(Duration::from_secs(5))).ok();
    socket.set_write_timeout(Some(Duration::from_secs(10))).ok();
    let peer_is_loopback = socket.peer_addr().is_ok_and(|addr| addr.ip().is_loopback());
    let request = match read_request(&socket) {
        Ok(request) => request,
        Err(e) => {
            respond(
                &mut socket,
                "400 Bad Request",
                "text/plain; charset=utf-8",
                format!("bad request: {e}\n").as_bytes(),
            );
            return;
        }
    };
    let viewer_path = format!("/s/{viewer_token}");
    let snapshot_path = format!("/api/{viewer_token}/snapshot");
    let events_path = format!("/api/{viewer_token}/events");
    let stop_path = format!("/control/{control_token}/stop");
    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/") => respond(
            &mut socket,
            "404 Not Found",
            "text/plain; charset=utf-8",
            b"ThoughtML stream: use the private viewer link printed by the CLI.\n",
        ),
        ("GET", path) if path == viewer_path => {
            let snapshot = shared.snapshot.lock().unwrap().clone();
            match stream_html(&snapshot, &snapshot_path, &events_path) {
                Ok(html) => respond(
                    &mut socket,
                    "200 OK",
                    "text/html; charset=utf-8",
                    html.as_bytes(),
                ),
                Err(e) => respond(
                    &mut socket,
                    "500 Internal Server Error",
                    "text/plain; charset=utf-8",
                    e.as_bytes(),
                ),
            }
        }
        ("GET", path) if path == snapshot_path => {
            let mut snapshot = shared.snapshot.lock().unwrap().clone();
            snapshot.connected_viewers = shared.viewers.load(Ordering::Relaxed);
            match serde_json::to_vec(&snapshot) {
                Ok(json) => respond(&mut socket, "200 OK", "application/json", &json),
                Err(e) => respond(
                    &mut socket,
                    "500 Internal Server Error",
                    "text/plain; charset=utf-8",
                    e.to_string().as_bytes(),
                ),
            }
        }
        ("GET", path) if path == events_path => serve_events(socket, shared),
        ("GET", "/health") => {
            let snapshot = shared.snapshot.lock().unwrap();
            let body = serde_json::to_vec(&serde_json::json!({
                "status": if shared.shutdown.load(Ordering::SeqCst) { "stopping" } else { "ok" },
                "revision": snapshot.sequence,
                "source_state": snapshot.source_state,
                "connected_viewers": shared.viewers.load(Ordering::Relaxed),
            }))
            .unwrap_or_else(|_| b"{\"status\":\"error\"}".to_vec());
            respond(&mut socket, "200 OK", "application/json", &body);
        }
        ("POST", path) if path == stop_path && peer_is_loopback => {
            shared.shutdown.store(true, Ordering::SeqCst);
            shared.changed.notify_all();
            respond(
                &mut socket,
                "202 Accepted",
                "application/json",
                b"{\"status\":\"stopping\"}\n",
            );
        }
        ("POST", path) if path == stop_path => respond(
            &mut socket,
            "403 Forbidden",
            "text/plain; charset=utf-8",
            b"stop control is only available from this computer\n",
        ),
        (method, _) if method != "GET" && method != "POST" => respond(
            &mut socket,
            "405 Method Not Allowed",
            "text/plain; charset=utf-8",
            b"method not allowed\n",
        ),
        _ => respond(
            &mut socket,
            "404 Not Found",
            "text/plain; charset=utf-8",
            b"not found\n",
        ),
    }
}

fn read_request(socket: &TcpStream) -> io::Result<Request> {
    let mut reader = BufReader::new(socket);
    let mut first = String::new();
    if reader.read_line(&mut first)? == 0 {
        return Err(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "empty request",
        ));
    }
    if first.len() > MAX_HEADER_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "request headers are too large",
        ));
    }
    let mut parts = first.split_whitespace();
    let method = parts
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing request method"))?;
    let path = parts
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing request path"))?;
    if parts.next().is_none() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "missing HTTP version",
        ));
    }
    let mut total = first.len();
    loop {
        let mut line = String::new();
        let read = reader.read_line(&mut line)?;
        if read == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "incomplete request headers",
            ));
        }
        total = total.saturating_add(read);
        if total > MAX_HEADER_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "request headers are too large",
            ));
        }
        if line == "\r\n" || line == "\n" {
            break;
        }
    }
    Ok(Request {
        method: method.to_string(),
        path: path.split('?').next().unwrap_or(path).to_string(),
    })
}

fn respond(socket: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = socket.write_all(header.as_bytes());
    let _ = socket.write_all(body);
    let _ = socket.flush();
}

fn serve_events(mut socket: TcpStream, shared: Arc<SharedState>) {
    let viewers = shared.viewers.fetch_add(1, Ordering::SeqCst) + 1;
    if viewers > MAX_SSE_CLIENTS {
        shared.viewers.fetch_sub(1, Ordering::SeqCst);
        respond(
            &mut socket,
            "503 Service Unavailable",
            "text/plain; charset=utf-8",
            b"too many live viewers\n",
        );
        return;
    }
    struct ViewerGuard<'a>(&'a AtomicUsize);
    impl Drop for ViewerGuard<'_> {
        fn drop(&mut self) {
            self.0.fetch_sub(1, Ordering::SeqCst);
        }
    }
    let _viewer_guard = ViewerGuard(&shared.viewers);
    let header = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nX-Content-Type-Options: nosniff\r\nX-Accel-Buffering: no\r\nConnection: keep-alive\r\n\r\n";
    if socket.write_all(header.as_bytes()).is_err() {
        return;
    }
    if writeln!(
        socket,
        "event: presence\ndata: {{\"connected_viewers\":{viewers}}}\n"
    )
    .is_err()
    {
        return;
    }
    let mut seen = 0;
    loop {
        let guard = shared.snapshot.lock().unwrap();
        let (snapshot, timeout) = shared
            .changed
            .wait_timeout_while(guard, Duration::from_secs(15), |s| {
                s.sequence == seen && !shared.shutdown.load(Ordering::SeqCst)
            })
            .unwrap();
        if shared.shutdown.load(Ordering::SeqCst) {
            drop(snapshot);
            let _ = socket.write_all(b"event: ended\ndata: {\"reason\":\"stopped\"}\n\n");
            let _ = socket.flush();
            return;
        } else if snapshot.sequence != seen {
            seen = snapshot.sequence;
            let mut outgoing = snapshot.clone();
            outgoing.connected_viewers = shared.viewers.load(Ordering::Relaxed);
            let json = match serde_json::to_string(&outgoing) {
                Ok(json) => json,
                Err(_) => return,
            };
            drop(snapshot);
            if writeln!(socket, "id: {seen}\nevent: snapshot\ndata: {json}\n").is_err() {
                return;
            }
        } else {
            drop(snapshot);
            if timeout.timed_out() && socket.write_all(b": keepalive\n\n").is_err() {
                return;
            }
        }
        if socket.flush().is_err() {
            return;
        }
    }
}

fn reject_busy(mut socket: TcpStream) {
    respond(
        &mut socket,
        "503 Service Unavailable",
        "text/plain; charset=utf-8",
        b"stream server is busy\n",
    );
}

fn stream_html(
    snapshot: &Snapshot,
    snapshot_path: &str,
    events_path: &str,
) -> Result<String, String> {
    if !VIEWER_TEMPLATE.contains(MODEL_MARKER)
        || !VIEWER_TEMPLATE.contains(TITLE_MARKER)
        || !VIEWER_TEMPLATE.contains(STREAM_MARKER)
    {
        return Err("viewer template is missing a live-stream placeholder; rebuild it with `npm run build:viewer`".into());
    }
    let model = snapshot
        .canonical
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| e.to_string())?
        .unwrap_or_default()
        .replace("</", "<\\/");
    let config = serde_json::json!({ "snapshot": snapshot_path, "events": events_path });
    let config = serde_json::to_string(&config)
        .map_err(|e| e.to_string())?
        .replace("</", "<\\/");
    let title = snapshot.title.replace("</", "<\\/");
    Ok(VIEWER_TEMPLATE
        .replace(MODEL_MARKER, &format!("{MODEL_MARKER}{model}"))
        .replace(TITLE_MARKER, &format!("{TITLE_MARKER}{title}"))
        .replace(STREAM_MARKER, &format!("{STREAM_MARKER}{config}")))
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn discover_lan_ip() -> Option<IpAddr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket.connect((Ipv4Addr::new(192, 0, 2, 1), 80)).ok()?;
    Some(socket.local_addr().ok()?.ip())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(source: &str) -> ProjectRead {
        ProjectRead {
            entry_path: PathBuf::from("test.thml"),
            entry: source.to_string(),
            sources: HashMap::new(),
            watched: vec![PathBuf::from("test.thml")],
            file_hashes: HashMap::from([("test.thml".to_string(), hash_value(&source))]),
            changed_files: Vec::new(),
            signature: 1,
        }
    }

    fn state() -> Arc<SharedState> {
        Arc::new(SharedState {
            snapshot: Mutex::new(compile_project(
                &project("claim visible\n  Stream me."),
                "test",
                false,
                None,
                1,
                Vec::new(),
            )),
            changed: Condvar::new(),
            shutdown: AtomicBool::new(false),
            viewers: AtomicUsize::new(0),
            connections: AtomicUsize::new(0),
        })
    }

    fn exchange(request: &str, shared: Arc<SharedState>) -> String {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (socket, _) = listener.accept().unwrap();
            handle_connection(socket, "viewer-secret", "control-secret", shared);
        });
        let mut client = TcpStream::connect(address).unwrap();
        client.write_all(request.as_bytes()).unwrap();
        client.flush().unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).unwrap();
        server.join().unwrap();
        response
    }

    #[test]
    fn invalid_revision_keeps_last_valid_model() {
        let valid = compile_project(
            &project("claim stable\n  The last good graph."),
            "test",
            false,
            None,
            1,
            Vec::new(),
        );
        let invalid = compile_project(
            &project("this is not valid"),
            "test",
            false,
            valid.canonical.as_ref(),
            2,
            valid.activity,
        );
        assert_eq!(invalid.source_state, "invalid");
        assert!(invalid.showing_last_valid);
        assert!(invalid.canonical.is_some());
        assert_eq!(invalid.activity.last().unwrap().kind, "invalid");
    }

    #[test]
    fn stream_page_contains_initial_model_and_endpoints() {
        let snapshot = compile_project(
            &project("claim visible\n  Stream me."),
            "demo",
            false,
            None,
            1,
            Vec::new(),
        );
        let html = stream_html(&snapshot, "/snapshot", "/events").unwrap();
        assert!(html.contains("Stream me."));
        assert!(html.contains("\"events\":\"/events\""));
        assert!(html.contains("id=\"thoughtml-stream-config\">{"));
    }

    #[test]
    fn import_scanner_only_accepts_top_level_imports() {
        assert_eq!(
            import_names("import base as b\n  import nope as n"),
            ["base"]
        );
    }

    #[test]
    fn request_reader_consumes_headers_and_strips_query() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let reader = thread::spawn(move || {
            let (socket, _) = listener.accept().unwrap();
            read_request(&socket).unwrap()
        });
        let mut client = TcpStream::connect(address).unwrap();
        client
            .write_all(
                b"GET /health?probe=1 HTTP/1.1\r\nHost: localhost\r\nX-Test: complete\r\n\r\n",
            )
            .unwrap();
        assert_eq!(
            reader.join().unwrap(),
            Request {
                method: "GET".into(),
                path: "/health".into(),
            }
        );
    }

    #[test]
    fn root_does_not_reveal_private_viewer_token() {
        let response = exchange(
            "GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
            state(),
        );
        assert!(response.starts_with("HTTP/1.1 404"));
        assert!(!response.contains("viewer-secret"));
    }

    #[test]
    fn private_snapshot_requires_exact_token() {
        let rejected = exchange(
            "GET /api/wrong/snapshot HTTP/1.1\r\nHost: localhost\r\n\r\n",
            state(),
        );
        assert!(rejected.starts_with("HTTP/1.1 404"));
        let accepted = exchange(
            "GET /api/viewer-secret/snapshot HTTP/1.1\r\nHost: localhost\r\n\r\n",
            state(),
        );
        assert!(accepted.starts_with("HTTP/1.1 200"));
        assert!(accepted.contains("\"source_state\":\"valid\""));
    }

    #[test]
    fn local_control_request_stops_the_session() {
        let shared = state();
        let response = exchange(
            "POST /control/control-secret/stop HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n",
            Arc::clone(&shared),
        );
        assert!(response.starts_with("HTTP/1.1 202"));
        assert!(shared.shutdown.load(Ordering::SeqCst));
    }

    #[test]
    fn event_stream_announces_a_graceful_end() {
        let shared = state();
        shared.shutdown.store(true, Ordering::SeqCst);
        let response = exchange(
            "GET /api/viewer-secret/events HTTP/1.1\r\nHost: localhost\r\n\r\n",
            shared,
        );
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains("event: ended"));
    }

    #[test]
    fn connected_event_stream_wakes_immediately_when_stopped() {
        let shared = state();
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let server_state = Arc::clone(&shared);
        let server = thread::spawn(move || {
            let (socket, _) = listener.accept().unwrap();
            handle_connection(socket, "viewer-secret", "control-secret", server_state);
        });
        let mut client = TcpStream::connect(address).unwrap();
        client
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        client
            .write_all(b"GET /api/viewer-secret/events HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .unwrap();
        let mut first = [0_u8; 2048];
        let read = client.read(&mut first).unwrap();
        let mut response = String::from_utf8_lossy(&first[..read]).to_string();
        shared.shutdown.store(true, Ordering::SeqCst);
        shared.changed.notify_all();
        client.read_to_string(&mut response).unwrap();
        server.join().unwrap();
        assert!(response.contains("event: ended"));
    }

    #[test]
    fn tokens_are_random_hex_and_file_changes_are_precise() {
        let first = secure_token(24).unwrap();
        let second = secure_token(24).unwrap();
        assert_eq!(first.len(), 48);
        assert!(first.chars().all(|character| character.is_ascii_hexdigit()));
        assert_ne!(first, second);

        let old = HashMap::from([("entry.thml".into(), 1), ("old.thml".into(), 2)]);
        let new = HashMap::from([("entry.thml".into(), 3), ("new.thml".into(), 4)]);
        assert_eq!(
            changed_files(&old, &new),
            ["entry.thml", "new.thml", "old.thml"]
        );
    }

    #[test]
    fn project_reader_watches_transitive_imports() {
        let dir = std::env::temp_dir().join(format!(
            "thoughtml-stream-{}-{}",
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let entry = dir.join("entry.thml");
        std::fs::write(&entry, "import base as b\nclaim root\n  Root.\n").unwrap();
        std::fs::write(
            dir.join("base.thml"),
            "import leaf as l\nclaim middle\n  Middle.\n",
        )
        .unwrap();
        std::fs::write(dir.join("leaf.thml"), "claim end\n  End.\n").unwrap();

        let project = read_project(&entry).unwrap();
        let names: HashSet<_> = project
            .watched
            .iter()
            .filter_map(|path| path.file_name().and_then(|name| name.to_str()))
            .collect();
        assert_eq!(
            names,
            HashSet::from(["entry.thml", "base.thml", "leaf.thml"])
        );
        assert_eq!(project.sources.len(), 2);

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
