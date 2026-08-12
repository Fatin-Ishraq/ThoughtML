//! Computer-hosted live ThoughtML sessions.
//!
//! The compiler and source files stay local. This module serves the embedded
//! standalone viewer, publishes canonical snapshots over Server-Sent Events,
//! and recompiles the complete import closure after a short debounce.

use serde::Serialize;
use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::io::{self, BufRead, BufReader, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const VIEWER_TEMPLATE: &str = include_str!("../assets/viewer.html");
const MODEL_MARKER: &str = "id=\"thoughtml-model\">";
const TITLE_MARKER: &str = "id=\"thoughtml-title\">";
const STREAM_MARKER: &str = "id=\"thoughtml-stream-config\">";
const SCHEMA_VERSION: u32 = 1;
const MAX_ACTIVITY: usize = 40;

#[derive(clap::Args, Debug)]
pub(crate) struct StreamArgs {
    /// Entry ThoughtML file. Its transitive sibling imports are watched too.
    pub(crate) file: PathBuf,

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

#[derive(Clone, Serialize)]
struct Activity {
    sequence: u64,
    at_ms: u128,
    kind: &'static str,
    summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
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
}

struct SharedState {
    snapshot: Mutex<Snapshot>,
    changed: Condvar,
}

struct ProjectRead {
    entry: String,
    sources: HashMap<String, String>,
    watched: Vec<PathBuf>,
    signature: u64,
}

#[derive(Serialize)]
struct Startup<'a> {
    status: &'static str,
    viewer_url: &'a str,
    bind_address: String,
    entry_file: String,
    transport: &'static str,
}

pub(crate) fn run(args: StreamArgs) -> ExitCode {
    if args.debounce_ms == 0 || args.poll_ms == 0 {
        eprintln!("error: --debounce-ms and --poll-ms must be greater than zero");
        return ExitCode::FAILURE;
    }

    let entry = match args.file.canonicalize() {
        Ok(path) if path.is_file() => path,
        Ok(path) => {
            eprintln!("error: {} is not a file", path.display());
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("error: cannot open {}: {e}", args.file.display());
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
    let session = session_id(&entry);
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
    });

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
    let viewer_url = format!("http://{advertised}:{}/s/{session}", bound.port());
    let startup = Startup {
        status: "streaming",
        viewer_url: &viewer_url,
        bind_address: bound.to_string(),
        entry_file: entry.display().to_string(),
        transport: "local-http+sse",
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
            println!("Access:   anyone who can reach this computer and has the link can view it");
        } else {
            println!("Access:   this computer only (use --lan to share on your local network)");
        }
        io::stdout().flush().ok();
    }

    let poll = Duration::from_millis(args.poll_ms);
    let debounce = Duration::from_millis(args.debounce_ms);
    let mut last_poll = Instant::now();
    let mut known_signature = project.signature;
    let mut pending_since: Option<Instant> = None;
    let mut pending_project: Option<ProjectRead> = None;

    loop {
        loop {
            match listener.accept() {
                Ok((socket, _)) => {
                    let state = Arc::clone(&shared);
                    let sid = session.clone();
                    thread::spawn(move || handle_connection(socket, &sid, state));
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
                    pending_project = Some(next);
                    pending_since = Some(Instant::now());
                }
                Ok(_) => {}
                Err(e) => eprintln!("stream: waiting for readable files: {e}"),
            }
        }

        if pending_since.is_some_and(|at| at.elapsed() >= debounce) {
            if let Some(project) = pending_project.take() {
                publish_compile(&shared, &project, &title, args.strict_provenance);
            }
            pending_since = None;
        }

        thread::sleep(Duration::from_millis(20));
    }
}

fn publish_compile(shared: &SharedState, project: &ProjectRead, title: &str, strict: bool) {
    let previous = shared.snapshot.lock().unwrap().clone();
    let next = compile_project(
        project,
        title,
        strict,
        previous.canonical.as_ref(),
        previous.sequence + 1,
        previous.activity,
    );
    let status = next.source_state;
    let sequence = next.sequence;
    let errors = next
        .diagnostics
        .iter()
        .filter(|d| d.severity == thoughtml::Severity::Error)
        .count();
    *shared.snapshot.lock().unwrap() = next;
    shared.changed.notify_all();
    if status == "valid" {
        eprintln!("stream: published revision {sequence}");
    } else {
        eprintln!(
            "stream: revision {sequence} has {errors} error(s); keeping the last valid graph"
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
                Activity {
                    sequence,
                    at_ms: now,
                    kind: if diff.changed {
                        "revision"
                    } else {
                        "unchanged"
                    },
                    summary: if diff.changed {
                        format!("Published revision {sequence}")
                    } else {
                        "Source changed; reasoning model unchanged".to_string()
                    },
                    detail: diff.changed.then_some(diff.text),
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
        diagnostics: result.diagnostics.items,
        watched_files: display_paths(&project.watched, project.watched.first()),
        activity,
    }
}

fn read_project(entry: &Path) -> io::Result<ProjectRead> {
    let entry_source = std::fs::read_to_string(entry)?;
    let dir = entry.parent().unwrap_or_else(|| Path::new("."));
    let mut sources = HashMap::new();
    let mut watched = vec![entry.to_path_buf()];
    let mut seen = HashSet::new();
    let mut queue = import_names(&entry_source);
    let mut hasher = DefaultHasher::new();
    entry.hash(&mut hasher);
    entry_source.hash(&mut hasher);
    while let Some(name) = queue.pop() {
        if !seen.insert(name.clone()) {
            continue;
        }
        let path = dir.join(format!("{name}.thml"));
        watched.push(path.clone());
        path.hash(&mut hasher);
        match std::fs::read_to_string(&path) {
            Ok(source) => {
                source.hash(&mut hasher);
                queue.extend(import_names(&source));
                sources.insert(name, source);
            }
            Err(e) => e.kind().hash(&mut hasher),
        }
    }
    watched.sort();
    watched.dedup();
    Ok(ProjectRead {
        entry: entry_source,
        sources,
        watched,
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

fn handle_connection(mut socket: TcpStream, session: &str, shared: Arc<SharedState>) {
    socket.set_read_timeout(Some(Duration::from_secs(5))).ok();
    let request = match read_request(&socket) {
        Ok(request) => request,
        Err(_) => return,
    };
    let viewer_path = format!("/s/{session}");
    let snapshot_path = format!("/api/{session}/snapshot");
    let events_path = format!("/api/{session}/events");
    match request.as_str() {
        "/" => redirect(&mut socket, &viewer_path),
        path if path == viewer_path => {
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
        path if path == snapshot_path => {
            let snapshot = shared.snapshot.lock().unwrap().clone();
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
        path if path == events_path => serve_events(socket, shared),
        "/health" => respond(&mut socket, "200 OK", "text/plain; charset=utf-8", b"ok\n"),
        _ => respond(
            &mut socket,
            "404 Not Found",
            "text/plain; charset=utf-8",
            b"not found\n",
        ),
    }
}

fn read_request(socket: &TcpStream) -> io::Result<String> {
    let mut reader = BufReader::new(socket);
    let mut first = String::new();
    reader.read_line(&mut first)?;
    let mut parts = first.split_whitespace();
    if parts.next() != Some("GET") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "only GET is supported",
        ));
    }
    let path = parts
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing request path"))?;
    Ok(path.split('?').next().unwrap_or(path).to_string())
}

fn respond(socket: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = socket.write_all(header.as_bytes());
    let _ = socket.write_all(body);
}

fn redirect(socket: &mut TcpStream, location: &str) {
    let response = format!(
        "HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
    );
    let _ = socket.write_all(response.as_bytes());
}

fn serve_events(mut socket: TcpStream, shared: Arc<SharedState>) {
    let header = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nX-Accel-Buffering: no\r\nConnection: keep-alive\r\n\r\n";
    if socket.write_all(header.as_bytes()).is_err() {
        return;
    }
    let mut seen = 0;
    loop {
        let guard = shared.snapshot.lock().unwrap();
        let (snapshot, timeout) = shared
            .changed
            .wait_timeout_while(guard, Duration::from_secs(15), |s| s.sequence == seen)
            .unwrap();
        if snapshot.sequence != seen {
            seen = snapshot.sequence;
            let json = match serde_json::to_string(&*snapshot) {
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

fn session_id(entry: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    entry.hash(&mut hasher);
    now_ms().hash(&mut hasher);
    std::process::id().hash(&mut hasher);
    format!("{:016x}", hasher.finish())
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
            entry: source.to_string(),
            sources: HashMap::new(),
            watched: vec![PathBuf::from("test.thml")],
            signature: 1,
        }
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
