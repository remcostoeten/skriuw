
mod config;
mod http;

use std::{
    collections::HashMap,
    net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        mpsc,
    },
    thread::JoinHandle,
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use config::AgentServerConfig;
use http::{Admission, Forwarded, Response};

pub(crate) const AGENT_REQUEST_EVENT: &str = "agent-server-request";
const MAIN_WINDOW: &str = "main";
const ANSWER_TIMEOUT: Duration = Duration::from_secs(60);
const SOCKET_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_CONNECTIONS: usize = 16;

type Emit = Box<dyn Fn(u64, &str) -> Result<(), String> + Send + Sync>;

/// Carries JSON-RPC requests to the renderer and waits for its answers.
pub(crate) struct RendererBridge {
    emit: Emit,
    attached: AtomicBool,
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, mpsc::SyncSender<String>>>,
    timeout: Duration,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RequestPayload<'a> {
    request_id: u64,
    message: &'a str,
}

impl RendererBridge {
    fn new(emit: Emit, timeout: Duration) -> Self {
        Self {
            emit,
            attached: AtomicBool::new(false),
            next_id: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
            timeout,
        }
    }

    fn for_app(app: AppHandle) -> Self {
        Self::new(
            Box::new(move |request_id, message| {
                app.emit_to(
                    MAIN_WINDOW,
                    AGENT_REQUEST_EVENT,
                    RequestPayload {
                        request_id,
                        message,
                    },
                )
                .map_err(|error| error.to_string())
            }),
            ANSWER_TIMEOUT,
        )
    }

    fn forward(&self, message: String) -> Forwarded {
        if !self.attached.load(Ordering::SeqCst) {
            return Forwarded::Unavailable(
                "Skriuw is running but its workspace is not open yet. Open the Skriuw window and try again."
                    .into(),
            );
        }
        let request_id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = mpsc::sync_channel(1);
        self.pending_requests().insert(request_id, sender);
        if let Err(error) = (self.emit)(request_id, &message) {
            self.pending_requests().remove(&request_id);
            return Forwarded::Unavailable(format!("Skriuw could not reach its window: {error}"));
        }
        match receiver.recv_timeout(self.timeout) {
            Ok(answer) => Forwarded::Answer(answer),
            Err(_) => {
                self.pending_requests().remove(&request_id);
                Forwarded::Unavailable(format!(
                    "Skriuw did not answer within {} seconds.",
                    self.timeout.as_secs()
                ))
            }
        }
    }

    fn answer(&self, request_id: u64, answer: String) -> bool {
        let Some(sender) = self.pending_requests().remove(&request_id) else {
            return false;
        };
        sender.send(answer).is_ok()
    }

    fn set_attached(&self, attached: bool) {
        self.attached.store(attached, Ordering::SeqCst);
    }

    fn pending_requests(
        &self,
    ) -> std::sync::MutexGuard<'_, HashMap<u64, mpsc::SyncSender<String>>> {
        self.pending
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

struct RunningListener {
    port: u16,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl RunningListener {
    fn spawn(port: u16, token: String, bridge: Arc<RendererBridge>) -> Result<Self, String> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port))
            .map_err(|error| format!("Port {port} is not available: {error}"))?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let stop = Arc::new(AtomicBool::new(false));
        let thread = std::thread::Builder::new()
            .name("skriuw-agent-server".into())
            .spawn({
                let stop = Arc::clone(&stop);
                move || accept_loop(&listener, port, &token, &bridge, &stop)
            })
            .map_err(|error| format!("could not start agent access: {error}"))?;
        Ok(Self {
            port,
            stop,
            thread: Some(thread),
        })
    }

    fn shutdown(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // accept() only returns on a connection, so the listener is woken with one.
        let _ = TcpStream::connect_timeout(
            &SocketAddr::from((Ipv4Addr::LOCALHOST, self.port)),
            Duration::from_secs(1),
        );
        if let Some(thread) = self.thread.take()
            && thread.join().is_err()
        {
            eprintln!("agent access listener stopped with a panic");
        }
    }
}

fn accept_loop(
    listener: &TcpListener,
    port: u16,
    token: &str,
    bridge: &Arc<RendererBridge>,
    stop: &AtomicBool,
) {
    let active = Arc::new(AtomicUsize::new(0));
    for stream in listener.incoming() {
        if stop.load(Ordering::SeqCst) {
            break;
        }
        let Ok(stream) = stream else {
            continue;
        };
        if active.fetch_add(1, Ordering::SeqCst) >= MAX_CONNECTIONS {
            active.fetch_sub(1, Ordering::SeqCst);
            let _ = http::write_response(&stream, &Response::empty(503));
            continue;
        }
        let token = token.to_owned();
        let bridge = Arc::clone(bridge);
        let finished = Arc::clone(&active);
        let spawned = std::thread::Builder::new()
            .name("skriuw-agent-request".into())
            .spawn(move || {
                serve(&stream, port, &token, &bridge);
                finished.fetch_sub(1, Ordering::SeqCst);
            });
        if spawned.is_err() {
            active.fetch_sub(1, Ordering::SeqCst);
        }
    }
}

fn serve(stream: &TcpStream, port: u16, token: &str, bridge: &RendererBridge) {
    let _ = stream.set_read_timeout(Some(SOCKET_TIMEOUT));
    let _ = stream.set_write_timeout(Some(SOCKET_TIMEOUT));
    let response = match http::read_request(stream) {
        Ok(request) => http::route(&request, &Admission { port, token }, |message| {
            bridge.forward(message)
        }),
        Err(error) => error.response(),
    };
    if let Err(error) = http::write_response(stream, &response) {
        eprintln!("agent access response failed: {error}");
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentServerStatus {
    enabled: bool,
    running: bool,
    port: u16,
    url: String,
    token: String,
    error: Option<String>,
}

struct ServerState {
    config: AgentServerConfig,
    listener: Option<RunningListener>,
    error: Option<String>,
}

pub(crate) struct AgentServer {
    config_path: PathBuf,
    bridge: Arc<RendererBridge>,
    state: Mutex<ServerState>,
}

impl AgentServer {
    pub(crate) fn start(app: AppHandle, app_data_dir: &std::path::Path) -> Result<Self, String> {
        let config_path = config::config_path(app_data_dir);
        let config = config::load(&config_path)?;
        let server = Self {
            config_path,
            bridge: Arc::new(RendererBridge::for_app(app)),
            state: Mutex::new(ServerState {
                config,
                listener: None,
                error: None,
            }),
        };
        server.reconcile(&mut server.lock());
        Ok(server)
    }

    pub(crate) fn status(&self) -> AgentServerStatus {
        let state = self.lock();
        AgentServerStatus {
            enabled: state.config.enabled,
            running: state.listener.is_some(),
            port: state.config.port,
            url: format!(
                "http://127.0.0.1:{}{}",
                state.config.port,
                http::ENDPOINT_PATH
            ),
            token: state.config.token.clone(),
            error: state.error.clone(),
        }
    }

    pub(crate) fn configure(&self, enabled: bool, port: u16) -> Result<AgentServerStatus, String> {
        if port < 1024 {
            return Err("Choose a port from 1024 to 65535.".into());
        }
        {
            let mut state = self.lock();
            let mut next = state.config.clone();
            next.enabled = enabled;
            next.port = port;
            config::save(&self.config_path, &next)?;
            let restart = next.port != state.config.port;
            state.config = next;
            if restart && let Some(listener) = state.listener.take() {
                listener.shutdown();
            }
            self.reconcile(&mut state);
        }
        Ok(self.status())
    }

    pub(crate) fn rotate_token(&self) -> Result<AgentServerStatus, String> {
        {
            let mut state = self.lock();
            let mut next = state.config.clone();
            next.token = config::generate_token()?;
            config::save(&self.config_path, &next)?;
            state.config = next;
            if let Some(listener) = state.listener.take() {
                listener.shutdown();
            }
            self.reconcile(&mut state);
        }
        Ok(self.status())
    }

    pub(crate) fn shutdown(&self) {
        if let Some(listener) = self.lock().listener.take() {
            listener.shutdown();
        }
    }

    fn reconcile(&self, state: &mut ServerState) {
        if !state.config.enabled {
            if let Some(listener) = state.listener.take() {
                listener.shutdown();
            }
            state.error = None;
            return;
        }
        if state.listener.is_some() {
            return;
        }
        match RunningListener::spawn(
            state.config.port,
            state.config.token.clone(),
            Arc::clone(&self.bridge),
        ) {
            Ok(listener) => {
                state.listener = Some(listener);
                state.error = None;
            }
            Err(error) => state.error = Some(error),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, ServerState> {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

#[tauri::command]
pub(crate) fn agent_server_status(server: State<'_, Arc<AgentServer>>) -> AgentServerStatus {
    server.status()
}

#[tauri::command]
pub(crate) async fn configure_agent_server(
    enabled: bool,
    port: u16,
    server: State<'_, Arc<AgentServer>>,
) -> Result<AgentServerStatus, String> {
    let server = Arc::clone(&server);
    tauri::async_runtime::spawn_blocking(move || server.configure(enabled, port))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn rotate_agent_server_token(
    server: State<'_, Arc<AgentServer>>,
) -> Result<AgentServerStatus, String> {
    let server = Arc::clone(&server);
    tauri::async_runtime::spawn_blocking(move || server.rotate_token())
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) fn attach_agent_bridge(server: State<'_, Arc<AgentServer>>) {
    server.bridge.set_attached(true);
}

#[tauri::command]
pub(crate) fn detach_agent_bridge(server: State<'_, Arc<AgentServer>>) {
    server.bridge.set_attached(false);
}

#[tauri::command]
pub(crate) fn answer_agent_request(
    request_id: u64,
    answer: String,
    server: State<'_, Arc<AgentServer>>,
) -> bool {
    server.bridge.answer(request_id, answer)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn echo_bridge(timeout: Duration) -> Arc<RendererBridge> {
        let slot: Arc<Mutex<Option<Arc<RendererBridge>>>> = Arc::new(Mutex::new(None));
        let emit_slot = Arc::clone(&slot);
        let bridge = Arc::new(RendererBridge::new(
            Box::new(move |request_id, message| {
                let message = message.to_owned();
                let bridge = emit_slot.lock().unwrap().clone().unwrap();
                std::thread::spawn(move || {
                    if !message.contains("\"silent\"") {
                        bridge.answer(request_id, format!("answer to {message}"));
                    }
                });
                Ok(())
            }),
            timeout,
        ));
        *slot.lock().unwrap() = Some(Arc::clone(&bridge));
        bridge
    }

    #[test]
    fn a_detached_bridge_refuses_without_emitting() {
        let bridge = RendererBridge::new(
            Box::new(|_, _| panic!("a detached bridge must not emit")),
            ANSWER_TIMEOUT,
        );
        assert!(matches!(
            bridge.forward("{}".into()),
            Forwarded::Unavailable(_)
        ));
    }

    #[test]
    fn an_attached_bridge_returns_the_renderer_answer() {
        let bridge = echo_bridge(ANSWER_TIMEOUT);
        bridge.set_attached(true);
        let Forwarded::Answer(answer) = bridge.forward("ping".into()) else {
            panic!("expected an answer");
        };
        assert_eq!(answer, "answer to ping");
    }

    #[test]
    fn an_unanswered_request_times_out_and_is_forgotten() {
        let bridge = echo_bridge(Duration::from_millis(50));
        bridge.set_attached(true);
        assert!(matches!(
            bridge.forward("\"silent\"".into()),
            Forwarded::Unavailable(_)
        ));
        assert!(bridge.pending_requests().is_empty());
        assert!(!bridge.answer(1, "late".into()));
    }

    #[test]
    fn the_listener_serves_a_real_request_and_stops() {
        let bridge = echo_bridge(ANSWER_TIMEOUT);
        bridge.set_attached(true);
        let listener = RunningListener::spawn(0, "token".into(), Arc::clone(&bridge)).unwrap();
        let port = listener.port;
        let body = r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        write!(
            stream,
            "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer token\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
        let mut reply = String::new();
        stream.read_to_string(&mut reply).unwrap();
        assert!(reply.starts_with("HTTP/1.1 200 OK"));
        assert!(reply.ends_with(&format!("answer to {body}")));
        listener.shutdown();
        assert!(TcpStream::connect((Ipv4Addr::LOCALHOST, port)).is_err());
    }
}
