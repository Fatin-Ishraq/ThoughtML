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
/// Per-peer share of the global connection budget, so one client cannot hold
/// every slot open and lock out the people the link was shared with.
const MAX_CONNECTIONS_PER_PEER: usize = 12;
/// Ceiling on a control-plane response read, so a misbehaving loopback listener
/// cannot stream indefinitely into `thoughtml stream status` / `stop`.
const MAX_CONTROL_RESPONSE_BYTES: u64 = 64 * 1024;

// Token sizes, in bytes of entropy and in the hex length they render to. The
// session id is generated independently of the viewer token: deriving it from a
// prefix of the token (as it once was) published 48 bits of a live secret into
// stdout, `--json` startup output, and `stream status`.
const VIEWER_TOKEN_BYTES: usize = 24;
const CONTROL_TOKEN_BYTES: usize = 32;
const SESSION_ID_BYTES: usize = 6;
const CONTROL_TOKEN_HEX: usize = CONTROL_TOKEN_BYTES * 2;
const SESSION_ID_HEX: usize = SESSION_ID_BYTES * 2;

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
    /// Also the one non-IP `Host` header the server will answer to.
    #[arg(long, value_name = "HOST")]
    advertise_host: Option<String>,

    /// Allow binding a public address. The stream is plain HTTP with its token
    /// in the URL, so this exposes the document to anyone who can see the traffic.
    #[arg(long)]
    expose_public: bool,

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
    source_map: thoughtml::SourceMap,
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
    /// Live connections per peer address, for the per-IP cap.
    per_peer: Mutex<HashMap<IpAddr, usize>>,
}

impl SharedState {
    /// Take a connection slot for `peer`, or refuse if it already holds its share.
    fn claim_peer(&self, peer: IpAddr) -> bool {
        let mut map = self.per_peer.lock().unwrap();
        let slot = map.entry(peer).or_insert(0);
        if *slot >= MAX_CONNECTIONS_PER_PEER {
            return false;
        }
        *slot += 1;
        true
    }

    fn release_peer(&self, peer: IpAddr) {
        let mut map = self.per_peer.lock().unwrap();
        if let Some(slot) = map.get_mut(&peer) {
            *slot = slot.saturating_sub(1);
            if *slot == 0 {
                map.remove(&peer);
            }
        }
    }
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
    /// Where this record was read from. Not part of the on-disk shape — records
    /// can come from the current directory or the legacy one, and reaping has to
    /// delete the file it actually found.
    #[serde(skip)]
    path: PathBuf,
}

/// Is `s` exactly `len` lowercase-or-uppercase hex digits?
fn is_hex(s: &str, len: usize) -> bool {
    s.len() == len && s.bytes().all(|b| b.is_ascii_hexdigit())
}

impl SessionRecord {
    /// Are the fields this process will *act on* shaped the way it wrote them?
    ///
    /// `control_token` is pasted into a request line, so a value carrying CR/LF
    /// would let whoever wrote the record smuggle extra HTTP requests into any
    /// loopback service (`request_local`). The session id becomes a file name.
    /// Both are generated as fixed-length hex, so anything else is not ours —
    /// reject the record rather than trust the disk.
    fn is_well_formed(&self) -> bool {
        is_hex(&self.session_id, SESSION_ID_HEX) && is_hex(&self.control_token, CONTROL_TOKEN_HEX)
    }
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
    // Anything past this machine is served in the clear, with the capability
    // token sitting in the URL — so it lands in browser history, proxy logs, and
    // `Referer`, and anyone on the path can read both it and the reasoning. `--lan`
    // says "my local network", which is a claim about the network, not the code —
    // so check what the network actually is rather than taking the flag's word.
    if bind_is_public(&bind_ip) && !args.expose_public {
        let reached = discover_lan_ip()
            .map(|ip| format!(" (this host is reachable at {ip})"))
            .unwrap_or_default();
        eprintln!(
            "error: binding {bind_ip} would expose this stream publicly{reached}. \
             `thoughtml stream` speaks plain HTTP and puts its access token in the URL, \
             so anyone who can see the traffic can read the document. Re-run with \
             --expose-public if that is genuinely what you want."
        );
        return ExitCode::FAILURE;
    }
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
    let viewer_token = match secure_token(VIEWER_TOKEN_BYTES) {
        Ok(token) => token,
        Err(e) => {
            eprintln!("error: cannot create a secure stream token: {e}");
            return ExitCode::FAILURE;
        }
    };
    let control_token = match secure_token(CONTROL_TOKEN_BYTES) {
        Ok(token) => token,
        Err(e) => {
            eprintln!("error: cannot create a secure control token: {e}");
            return ExitCode::FAILURE;
        }
    };
    // Independent of the viewer token — the session id is printed to stdout and
    // listed by `stream status`, so it must not be a prefix of a live secret.
    let session = match secure_token(SESSION_ID_BYTES) {
        Ok(id) => id,
        Err(e) => {
            eprintln!("error: cannot create a session id: {e}");
            return ExitCode::FAILURE;
        }
    };
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
        per_peer: Mutex::new(HashMap::new()),
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
    // The only names this server answers to. `advertised` may be a bare hostname
    // when the operator supplied one; anything else with a name in `Host` is a
    // rebinding attempt (see `host_is_allowed`). Strip the IPv6 brackets so the
    // comparison sees the same form the header carries.
    let policy = HostPolicy {
        port: bound.port(),
        advertised: Some(
            advertised
                .trim_start_matches('[')
                .trim_end_matches(']')
                .to_string(),
        ),
    };
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
        path: PathBuf::new(),
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
            // Say what is actually true. The link is unguessable, but it travels
            // in cleartext HTTP with the token in the URL, so anyone who can see
            // the traffic — or read a browser history or proxy log afterwards —
            // has the same access the recipient does.
            println!("Access:   anyone on this network who has the link");
            println!("Privacy:  plain HTTP, token in the URL — do not use on untrusted networks");
            println!("Shared:   compiled reasoning, diagnostics, and file names");
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
                Ok((socket, peer)) => {
                    if shared.connections.load(Ordering::Relaxed) >= MAX_CONNECTIONS {
                        reject_busy(socket);
                        continue;
                    }
                    // Per-peer cap as well as the global one: without it a single
                    // client on the LAN can hold every slot open with slow headers
                    // and lock out everyone the link was actually shared with.
                    if !shared.claim_peer(peer.ip()) {
                        reject_busy(socket);
                        continue;
                    }
                    shared.connections.fetch_add(1, Ordering::Relaxed);
                    let state = Arc::clone(&shared);
                    let view_secret = viewer_token.clone();
                    let control_secret = control_token.clone();
                    let host_policy = policy.clone();
                    thread::spawn(move || {
                        handle_connection(
                            socket,
                            &view_secret,
                            &control_secret,
                            &host_policy,
                            state.clone(),
                        );
                        state.connections.fetch_sub(1, Ordering::Relaxed);
                        state.release_peer(peer.ip());
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
        previous
            .canonical
            .as_ref()
            .map(|canonical| (canonical, &previous.source_map)),
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
    previous_valid: Option<(&thoughtml::Canonical, &thoughtml::SourceMap)>,
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
    let previous_canonical = previous_valid.map(|(canonical, _)| canonical);
    let canonical = if valid {
        Some(result.canonical.clone())
    } else {
        previous_canonical.cloned()
    };
    let source_map = if valid {
        map_source_locations(result.source_map.clone(), project)
    } else {
        previous_valid
            .map(|(_, source_map)| source_map.clone())
            .unwrap_or_default()
    };
    let item = if valid {
        match previous_canonical {
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
        source_map,
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

/// Top-level `import <name> as <ns>` names, filtered to lexical identifiers.
///
/// Same reasoning as the CLI's copy: this drives a read and a watch entry, and an
/// unfiltered name escaped the project directory (absolute paths, `..`, or a
/// Windows UNC share). In this module it also fed `watched_files`, which is
/// published to every viewer — so a traversal path was disclosed as well.
fn import_names(source: &str) -> Vec<String> {
    source
        .lines()
        .filter(|line| line.starts_with("import "))
        .filter_map(|line| {
            let tokens: Vec<&str> = line.split_whitespace().collect();
            (tokens.len() == 4 && tokens[2] == "as" && thoughtml::lex::is_identifier(tokens[1]))
                .then(|| tokens[1].to_string())
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

fn map_source_locations(
    mut source_map: thoughtml::SourceMap,
    project: &ProjectRead,
) -> thoughtml::SourceMap {
    let entry_name = project
        .entry_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("entry.thml")
        .to_string();
    for location in source_map.objects.values_mut() {
        location.source = match location.source.as_str() {
            "entry" => entry_name.clone(),
            source if project.sources.contains_key(source) => format!("{source}.thml"),
            source => source.to_string(),
        };
    }
    source_map
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
        source_map: previous.source_map,
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

/// Where session records live: a **per-user, private** directory.
///
/// A record carries the control token *and* the viewer URL — and the viewer token
/// inside that URL is the only thing gating `/s/…`, the snapshot, and the event
/// stream. The shared system temp directory is therefore the wrong home for it:
/// on a multi-user machine every other account can list and read `/tmp`, and a
/// fixed path there can be pre-created or symlinked by whoever gets there first.
fn session_dir() -> PathBuf {
    #[cfg(unix)]
    {
        // Already per-user and 0700 when the system provides it.
        if let Some(runtime) = std::env::var_os("XDG_RUNTIME_DIR") {
            if !runtime.is_empty() {
                return PathBuf::from(runtime).join("thoughtml/stream-sessions");
            }
        }
        if let Some(home) = std::env::var_os("HOME") {
            if !home.is_empty() {
                return PathBuf::from(home).join(".cache/thoughtml/stream-sessions");
            }
        }
    }
    #[cfg(windows)]
    {
        // Per-user by default ACL, unlike the machine-wide temp directory.
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            if !local.is_empty() {
                return PathBuf::from(local).join("thoughtml\\stream-sessions");
            }
        }
    }
    // Last resort. `write_session_record` still clamps the mode to owner-only.
    std::env::temp_dir().join("thoughtml-stream-sessions")
}

/// Clamp a directory to owner-only (`0700`) on Unix; a no-op elsewhere, where the
/// chosen locations are already per-user by ACL.
fn restrict_dir(dir: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    #[cfg(not(unix))]
    let _ = dir;
    Ok(())
}

/// Create `path` fresh and owner-readable only (`0600`), then write `bytes`.
/// `create_new` refuses to follow anything already sitting at that name.
fn write_private(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

fn write_session_record(record: &SessionRecord) -> io::Result<PathBuf> {
    let dir = session_dir();
    std::fs::create_dir_all(&dir)?;
    restrict_dir(&dir)?;
    let path = dir.join(format!("{}.json", record.session_id));
    let temporary = dir.join(format!(".{}.{}.tmp", record.session_id, std::process::id()));
    let bytes = serde_json::to_vec_pretty(record).map_err(io::Error::other)?;
    // A leftover temp file from a crashed run of *this* pid would block
    // `create_new`; clearing it is safe now that the directory is owner-only.
    let _ = std::fs::remove_file(&temporary);
    write_private(&temporary, &bytes)?;
    std::fs::rename(&temporary, &path)?;
    Ok(path)
}

/// The legacy, world-readable location records were written to before they moved
/// to a per-user directory. Still *read* so an upgrade does not orphan a session
/// started by an older binary — and so `stream status`, which deletes records it
/// cannot reach, reaps the leftovers instead of leaving live tokens in `/tmp`.
fn legacy_session_dir() -> PathBuf {
    std::env::temp_dir().join("thoughtml-stream-sessions")
}

fn read_records_in(dir: &Path, records: &mut Vec<SessionRecord>) -> io::Result<()> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }
        match std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<SessionRecord>(&bytes).ok())
        {
            Some(mut record)
                if record.schema_version == SCHEMA_VERSION && record.is_well_formed() =>
            {
                record.path = path;
                records.push(record);
            }
            _ => {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    Ok(())
}

fn load_session_records() -> io::Result<Vec<SessionRecord>> {
    let mut records = Vec::new();
    read_records_in(&session_dir(), &mut records)?;
    let legacy = legacy_session_dir();
    if legacy != session_dir() {
        // Best-effort: the shared temp directory may not be readable by us.
        let _ = read_records_in(&legacy, &mut records);
    }
    // A session id is unique per process; keep the first sighting if an upgrade
    // left the same record in both places.
    let mut seen = HashSet::new();
    records.retain(|record| seen.insert(record.session_id.clone()));
    records.sort_by_key(|record| record.started_at_ms);
    Ok(records)
}

/// Send one request to a recorded session's control plane and return its response.
///
/// `path` is built from the record's `control_token`, which came off disk, so the
/// caller must have validated the record (`SessionRecord::is_well_formed`) first —
/// a token containing CR/LF would otherwise be written straight into the request
/// line and smuggle attacker-chosen requests into whatever listens on that port.
/// Re-checked here rather than assumed, since this is the function that writes.
fn request_local(record: &SessionRecord, method: &str, path: &str) -> io::Result<String> {
    if !record.is_well_formed() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "stream session record is malformed",
        ));
    }
    // Printable ASCII only: no CR, LF, space, or control bytes reach the socket.
    if path.bytes().any(|b| !(0x21..=0x7e).contains(&b)) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "refusing to send a control path with unsafe characters",
        ));
    }
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
    // Bounded: only the status line matters to either caller.
    (&socket)
        .take(MAX_CONTROL_RESPONSE_BYTES)
        .read_to_string(&mut response)?;
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
                    // Delete the file we actually read, which may be the legacy
                    // world-readable one left by an older binary.
                    let _ = std::fs::remove_file(&record.path);
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
    host: Option<String>,
}

/// What `Host` values this server answers to.
#[derive(Clone)]
struct HostPolicy {
    port: u16,
    advertised: Option<String>,
}

/// Is this a private / link-local address — a "my own network" address, as
/// opposed to something routable from the internet?
///
/// Deliberately says nothing about the wildcard addresses `0.0.0.0` / `::`.
/// Those are not a network location at all, they are "every interface I have",
/// so whether they are safe depends on what interfaces the host actually has.
/// [`bind_is_public`] answers that question; classifying them here as private
/// was the bug — it let `--lan` on a public-IP host skip the exposure gate.
fn is_private_address(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_private() || v4.is_link_local() || v4.is_loopback(),
        IpAddr::V6(v6) => {
            v6.is_loopback()
                // fc00::/7 unique-local and fe80::/10 link-local.
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

/// Would binding `bind_ip` expose this stream beyond the operator's own network?
///
/// A wildcard bind is the ordinary way to reach a machine from elsewhere, and on
/// a VPS or any host holding a routable address it is also the ordinary way to
/// publish something to the internet by accident. So rather than trusting the
/// literal `0.0.0.0`, ask the operating system which address it would use to
/// reach the outside world and judge *that*. A laptop on a home network answers
/// with a 192.168/10./172.16 address and `--lan` keeps working untouched; a cloud
/// host answers with its public address and the exposure gate engages.
///
/// No route at all (offline) means nothing is reachable, so nothing to gate.
fn bind_is_public(bind_ip: &IpAddr) -> bool {
    bind_reaches_public(bind_ip, discover_lan_ip())
}

/// The decision itself, with the host's outbound address passed in.
///
/// Split out so both branches are testable. The case this whole function exists
/// for — a wildcard bind on a host holding a routable address — is precisely the
/// one a test running on a laptop or a CI runner would otherwise never reach.
fn bind_reaches_public(bind_ip: &IpAddr, outbound: Option<IpAddr>) -> bool {
    if bind_ip.is_loopback() {
        return false;
    }
    if bind_ip.is_unspecified() {
        return outbound.is_some_and(|ip| !ip.is_loopback() && !is_private_address(&ip));
    }
    !is_private_address(bind_ip)
}

/// Split `host[:port]`, handling the `[::1]:port` form.
fn split_host_port(raw: &str) -> (&str, Option<u16>) {
    if let Some(rest) = raw.strip_prefix('[') {
        // IPv6 literal: [addr] or [addr]:port
        if let Some((addr, tail)) = rest.split_once(']') {
            let port = tail.strip_prefix(':').and_then(|p| p.parse().ok());
            return (addr, port);
        }
        return (raw, None);
    }
    match raw.rsplit_once(':') {
        Some((name, port)) if port.chars().all(|c| c.is_ascii_digit()) && !port.is_empty() => {
            (name, port.parse().ok())
        }
        _ => (raw, None),
    }
}

/// Is this request's `Host` one we serve?
///
/// Without this check a malicious web page can reach the server by DNS
/// rebinding: it points its own hostname at 127.0.0.1, so the browser treats
/// `http://evil.example/` as same-origin with the stream and the page can read
/// every response. Rebinding needs a *name* — a request that arrives with an IP
/// literal in `Host` is an ordinary cross-origin request the browser will not let
/// the page read — so IP literals, `localhost`, and whatever `--advertise-host`
/// declared are accepted, and any other name is refused.
fn host_is_allowed(host: Option<&str>, policy: &HostPolicy) -> bool {
    // HTTP/1.1 requires Host; a request without one is not a browser we trust.
    let Some(raw) = host else { return false };
    let (name, port) = split_host_port(raw.trim());
    if port.is_some_and(|p| p != policy.port) {
        return false;
    }
    if name.eq_ignore_ascii_case("localhost") || name.parse::<IpAddr>().is_ok() {
        return true;
    }
    policy
        .advertised
        .as_deref()
        .is_some_and(|a| a.eq_ignore_ascii_case(name))
}

/// Compare a secret without an early exit on the first differing byte. The
/// lengths are fixed and public, so only the contents need the constant-time
/// treatment.
fn secret_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// The routes this server exposes, after the capability token has been checked.
#[derive(Debug, PartialEq, Eq)]
enum Route {
    Root,
    Viewer,
    Snapshot,
    Events,
    Health,
    Stop,
    Unknown,
}

fn route_of(path: &str, viewer_token: &str, control_token: &str) -> Route {
    if path == "/" {
        return Route::Root;
    }
    if path == "/health" {
        return Route::Health;
    }
    if let Some(token) = path.strip_prefix("/s/") {
        if secret_eq(token, viewer_token) {
            return Route::Viewer;
        }
    }
    if let Some(rest) = path.strip_prefix("/api/") {
        if let Some((token, tail)) = rest.split_once('/') {
            if secret_eq(token, viewer_token) {
                match tail {
                    "snapshot" => return Route::Snapshot,
                    "events" => return Route::Events,
                    _ => {}
                }
            }
        }
    }
    if let Some(rest) = path.strip_prefix("/control/") {
        if let Some((token, "stop")) = rest.split_once('/') {
            if secret_eq(token, control_token) {
                return Route::Stop;
            }
        }
    }
    Route::Unknown
}

fn handle_connection(
    mut socket: TcpStream,
    viewer_token: &str,
    control_token: &str,
    policy: &HostPolicy,
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
    if !host_is_allowed(request.host.as_deref(), policy) {
        respond(
            &mut socket,
            "421 Misdirected Request",
            "text/plain; charset=utf-8",
            b"unrecognized Host\n",
        );
        return;
    }
    let snapshot_path = format!("/api/{viewer_token}/snapshot");
    let events_path = format!("/api/{viewer_token}/events");
    match (
        request.method.as_str(),
        route_of(&request.path, viewer_token, control_token),
    ) {
        ("GET", Route::Root) => respond(
            &mut socket,
            "404 Not Found",
            "text/plain; charset=utf-8",
            b"ThoughtML stream: use the private viewer link printed by the CLI.\n",
        ),
        ("GET", Route::Viewer) => {
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
        ("GET", Route::Snapshot) => {
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
        ("GET", Route::Events) => serve_events(socket, shared),
        // Loopback-only: on `--lan` an open health probe told the whole network a
        // session was live, how many people were watching, and how many revisions
        // in it was. `stream status` always probes over loopback.
        ("GET", Route::Health) if peer_is_loopback => {
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
        ("POST", Route::Stop) if peer_is_loopback => {
            shared.shutdown.store(true, Ordering::SeqCst);
            shared.changed.notify_all();
            respond(
                &mut socket,
                "202 Accepted",
                "application/json",
                b"{\"status\":\"stopping\"}\n",
            );
        }
        ("POST", Route::Stop) => respond(
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
    let mut host = None;
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
        if let Some((name, value)) = line.split_once(':') {
            // First Host wins; a second one is a request-smuggling smell, so refuse.
            if name.eq_ignore_ascii_case("host") {
                if host.is_some() {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "duplicate Host header",
                    ));
                }
                host = Some(value.trim().to_string());
            }
        }
    }
    Ok(Request {
        method: method.to_string(),
        path: path.split('?').next().unwrap_or(path).to_string(),
        host,
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
        .map(|canonical| {
            serde_json::to_string(&serde_json::json!({
                "canonical": canonical,
                "source_map": &snapshot.source_map,
            }))
        })
        .transpose()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let model = super::escape_json_for_script(&model);
    let config = serde_json::json!({ "snapshot": snapshot_path, "events": events_path });
    let config =
        super::escape_json_for_script(&serde_json::to_string(&config).map_err(|e| e.to_string())?);
    let title = super::sanitize_script_text(&snapshot.title);
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

    /// Accepts the `Host: localhost` the test requests send, on any port.
    fn test_policy() -> HostPolicy {
        HostPolicy {
            port: 0,
            advertised: None,
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
            per_peer: Mutex::new(HashMap::new()),
        })
    }

    fn exchange(request: &str, shared: Arc<SharedState>) -> String {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (socket, _) = listener.accept().unwrap();
            handle_connection(
                socket,
                "viewer-secret",
                "control-secret",
                &test_policy(),
                shared,
            );
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
            valid
                .canonical
                .as_ref()
                .map(|canonical| (canonical, &valid.source_map)),
            2,
            valid.activity,
        );
        assert_eq!(invalid.source_state, "invalid");
        assert!(invalid.showing_last_valid);
        assert!(invalid.canonical.is_some());
        assert_eq!(
            invalid.source_map.objects.get("stable").unwrap().source,
            "test.thml"
        );
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
        assert!(html.contains("&quot;source_map&quot;") || html.contains("\"source_map\""));
        assert!(html.contains("reasoning-card"));
        assert!(!html.contains("detail-pane"));
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
                host: Some("localhost".into()),
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
            handle_connection(
                socket,
                "viewer-secret",
                "control-secret",
                &test_policy(),
                server_state,
            );
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

    fn record(session_id: &str, control_token: &str) -> SessionRecord {
        SessionRecord {
            schema_version: SCHEMA_VERSION,
            session_id: session_id.to_string(),
            viewer_url: "http://127.0.0.1:9/s/x".into(),
            control_addr: "127.0.0.1:9".into(),
            control_token: control_token.to_string(),
            entry_file: "entry.thml".into(),
            started_at_ms: 0,
            pid: 1,
            path: PathBuf::new(),
        }
    }

    #[test]
    fn unrecognized_host_headers_are_refused() {
        // DNS rebinding: a page at evil.example points that name at 127.0.0.1, so
        // the browser treats the stream as same-origin and can read every response.
        // The defence is refusing the *name*; an IP literal cannot be rebound.
        let rebound = exchange(
            "GET / HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n",
            state(),
        );
        assert!(rebound.starts_with("HTTP/1.1 421"));

        let ip_literal = exchange(
            "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
            state(),
        );
        assert!(ip_literal.starts_with("HTTP/1.1 404"));

        // HTTP/1.1 requires Host; a request without one is not a browser.
        let missing = exchange("GET / HTTP/1.1\r\nConnection: close\r\n\r\n", state());
        assert!(missing.starts_with("HTTP/1.1 421"));
    }

    #[test]
    fn host_policy_matches_ports_and_advertised_names() {
        let policy = HostPolicy {
            port: 8080,
            advertised: Some("my-laptop.local".into()),
        };
        assert!(host_is_allowed(Some("localhost:8080"), &policy));
        assert!(host_is_allowed(Some("192.168.1.5:8080"), &policy));
        assert!(host_is_allowed(Some("[::1]:8080"), &policy));
        assert!(host_is_allowed(Some("my-laptop.local:8080"), &policy));
        // Wrong port, and any other name.
        assert!(!host_is_allowed(Some("localhost:9999"), &policy));
        assert!(!host_is_allowed(Some("evil.example:8080"), &policy));
        assert!(!host_is_allowed(None, &policy));
    }

    #[test]
    fn health_is_not_served_to_the_network() {
        // Loopback-only: on `--lan` this used to tell anyone on the network that a
        // session was live, how many viewers it had, and how many revisions in.
        // The test client connects over loopback, so it still gets an answer.
        let response = exchange(
            "GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
            state(),
        );
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains("\"revision\""));
    }

    #[test]
    fn route_matching_requires_the_whole_token() {
        // A prefix of the real token must not open anything.
        assert_eq!(
            route_of("/s/viewer-secret", "viewer-secret", "control-secret"),
            Route::Viewer
        );
        assert_eq!(
            route_of("/s/viewer-secre", "viewer-secret", "control-secret"),
            Route::Unknown
        );
        assert_eq!(
            route_of("/api/viewer-secret/snapshot", "viewer-secret", "c"),
            Route::Snapshot
        );
        assert_eq!(
            route_of("/api/nope/snapshot", "viewer-secret", "c"),
            Route::Unknown
        );
        assert_eq!(
            route_of("/control/control-secret/stop", "v", "control-secret"),
            Route::Stop
        );
        assert_eq!(
            route_of("/control/nope/stop", "v", "control-secret"),
            Route::Unknown
        );
    }

    #[test]
    fn secret_comparison_is_length_safe() {
        assert!(secret_eq("abc", "abc"));
        assert!(!secret_eq("abc", "abd"));
        assert!(!secret_eq("abc", "ab"));
        assert!(!secret_eq("ab", "abc"));
    }

    #[test]
    fn one_peer_cannot_take_every_connection_slot() {
        let shared = state();
        let peer: IpAddr = "203.0.113.7".parse().unwrap();
        for _ in 0..MAX_CONNECTIONS_PER_PEER {
            assert!(shared.claim_peer(peer));
        }
        assert!(!shared.claim_peer(peer), "per-peer cap was not enforced");
        // A different client is unaffected.
        assert!(shared.claim_peer("203.0.113.8".parse().unwrap()));
        // Slots come back when connections close.
        shared.release_peer(peer);
        assert!(shared.claim_peer(peer));
    }

    #[test]
    fn public_binds_are_recognized_as_public() {
        for private in ["127.0.0.1", "192.168.1.10", "10.0.0.4", "172.16.5.1"] {
            let ip = private.parse().unwrap();
            assert!(is_private_address(&ip), "{private} is a private address");
            assert!(!bind_is_public(&ip), "{private} must not require the flag");
        }
        for public in ["203.0.113.7", "8.8.8.8"] {
            let ip = public.parse().unwrap();
            assert!(!is_private_address(&ip), "{public} is a public address");
            assert!(bind_is_public(&ip), "{public} must require --expose-public");
        }
        // IPv6 loopback and unique-local are private; a routable one is not.
        assert!(!bind_is_public(&"::1".parse().unwrap()));
        assert!(!bind_is_public(&"fd00::1".parse().unwrap()));
        assert!(bind_is_public(&"2001:db8::1".parse().unwrap()));
    }

    /// The wildcard addresses are not a location, so they cannot be classified on
    /// their own — `0.0.0.0` on a laptop is the LAN, and on a VPS it is the
    /// internet. Treating them as inherently private is what let `--lan` skip the
    /// exposure gate on a public-IP host.
    #[test]
    fn wildcard_binds_are_judged_by_the_hosts_real_address() {
        let lan: Option<IpAddr> = Some("192.168.1.20".parse().unwrap());
        let vps: Option<IpAddr> = Some("203.0.113.7".parse().unwrap());
        let offline: Option<IpAddr> = None;

        for wildcard in ["0.0.0.0", "::"] {
            let ip: IpAddr = wildcard.parse().unwrap();
            assert!(
                !is_private_address(&ip),
                "{wildcard} must not be classified as a private address"
            );
            // A laptop on a home network: `--lan` keeps working, no flag needed.
            assert!(
                !bind_reaches_public(&ip, lan),
                "{wildcard} on a private network must not require the flag"
            );
            // A cloud host: the same command publishes to the internet. This is
            // the case the gate exists for, and the one it used to miss.
            assert!(
                bind_reaches_public(&ip, vps),
                "{wildcard} on a public-IP host must require --expose-public"
            );
            // No route out: nothing is reachable, so nothing to gate.
            assert!(!bind_reaches_public(&ip, offline));
        }

        // An explicit address is judged on its own merits, whatever the host is.
        assert!(bind_reaches_public(&"8.8.8.8".parse().unwrap(), lan));
        assert!(!bind_reaches_public(&"127.0.0.1".parse().unwrap(), vps));
        assert!(!bind_reaches_public(&"10.1.2.3".parse().unwrap(), vps));
    }

    #[test]
    fn import_scanner_rejects_paths_that_escape_the_project() {
        // The scan drives a filesystem read before the parser ever sees the name,
        // and `Path::join` discards the base for an absolute component.
        assert_eq!(
            import_names("import ../../../secrets as x"),
            Vec::<String>::new()
        );
        assert_eq!(
            import_names("import /etc/shadow as x"),
            Vec::<String>::new()
        );
        assert_eq!(
            import_names("import //attacker/share/x as y"),
            Vec::<String>::new()
        );
        assert_eq!(
            import_names("import C:\\Windows\\win as y"),
            Vec::<String>::new()
        );
        // Ordinary imports still resolve.
        assert_eq!(import_names("import base as b"), ["base"]);
        assert_eq!(import_names("import shared-defs as s"), ["shared-defs"]);
    }

    #[test]
    fn session_records_off_disk_must_be_shaped_like_ours() {
        let good = record(&"a".repeat(SESSION_ID_HEX), &"b".repeat(CONTROL_TOKEN_HEX));
        assert!(good.is_well_formed());

        // A control token is pasted into a request line; CR/LF in it would smuggle
        // extra HTTP requests into whatever loopback service the record names.
        let crlf = format!("{}\r\nX-Injected: 1", "b".repeat(CONTROL_TOKEN_HEX));
        assert!(!record(&"a".repeat(SESSION_ID_HEX), &crlf).is_well_formed());
        // Wrong length, non-hex, and traversal-shaped ids are all rejected.
        assert!(!record("../../etc/passwd", &"b".repeat(CONTROL_TOKEN_HEX)).is_well_formed());
        assert!(!record(&"a".repeat(SESSION_ID_HEX), "short").is_well_formed());
        assert!(
            !record(&"z".repeat(SESSION_ID_HEX), &"b".repeat(CONTROL_TOKEN_HEX)).is_well_formed()
        );
    }

    #[test]
    fn control_requests_refuse_a_malformed_record() {
        let crlf = format!("{}\r\nGET /evil HTTP/1.1", "b".repeat(CONTROL_TOKEN_HEX));
        let bad = record(&"a".repeat(SESSION_ID_HEX), &crlf);
        let err = request_local(&bad, "POST", "/control/x/stop").unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::InvalidData);

        // Even with a clean record, a path carrying control characters is refused
        // before a single byte reaches the socket.
        let good = record(&"a".repeat(SESSION_ID_HEX), &"b".repeat(CONTROL_TOKEN_HEX));
        let err = request_local(&good, "POST", "/control/a\r\nX: 1/stop").unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::InvalidInput);
    }

    #[test]
    fn session_id_is_not_derived_from_the_viewer_token() {
        let viewer = secure_token(VIEWER_TOKEN_BYTES).unwrap();
        let session = secure_token(SESSION_ID_BYTES).unwrap();
        assert_eq!(session.len(), SESSION_ID_HEX);
        // The id is published (stdout, `--json`, `stream status`); the token is not.
        assert!(!viewer.starts_with(&session));
    }

    #[test]
    fn session_directory_is_not_the_shared_temp_directory() {
        // The record holds the viewer token, which is the only thing gating the
        // reasoning graph. On a multi-user box the system temp dir is readable by
        // every other account, so it must not be the default home.
        let dir = session_dir();
        let shared = std::env::temp_dir();
        let private = std::env::var_os("XDG_RUNTIME_DIR").is_some()
            || std::env::var_os("HOME").is_some()
            || std::env::var_os("LOCALAPPDATA").is_some();
        if private {
            assert!(
                !dir.starts_with(&shared),
                "session dir {} still sits under the shared temp dir {}",
                dir.display(),
                shared.display()
            );
        }
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
