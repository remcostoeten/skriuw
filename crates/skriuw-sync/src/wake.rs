//! The reconnect policy of the push wake channel.
//!
//! The wake channel is a latency optimization only: every failure falls back
//! to the coordinator's own poll interval, so the listener never surfaces in
//! sync status and never blocks teardown. It holds its target weakly and
//! exits once the target is gone, the stop flag is set, or the service
//! refuses the session. The platform supplies only the socket.

use std::{
    sync::{
        Arc, Weak,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

use crate::coordinator::SyncCoordinator;

/// One read from an open wake socket.
pub enum WakeFrame {
    Text(String),
    /// The read deadline passed without a frame; the listener sends a
    /// keepalive and reads again.
    Idle,
    /// A frame the listener does not act on.
    Ignored,
    /// The service closed the socket or the read failed.
    Closed,
}

/// An open wake socket.
pub trait WakeSocket: Send {
    fn read(&mut self) -> WakeFrame;
    /// Returns false when the keepalive could not be sent.
    fn keepalive(&mut self) -> bool;
    fn close(&mut self);
}

pub enum WakeConnectError {
    /// The service refused the session at the handshake; retrying with the
    /// same credential cannot succeed.
    Rejected(u16),
    Failed(String),
}

/// Opens wake sockets for the platform.
pub trait WakeConnector: Send + Sync {
    fn connect(&self, url: &str, token: &str) -> Result<Box<dyn WakeSocket>, WakeConnectError>;
}

/// What the listener wakes.
pub trait WakeTarget: Send + Sync {
    fn notify_remote_change(&self);
    fn set_wake_channel_connected(&self, connected: bool);
}

impl WakeTarget for SyncCoordinator {
    fn notify_remote_change(&self) {
        SyncCoordinator::notify_remote_change(self);
    }

    fn set_wake_channel_connected(&self, connected: bool) {
        SyncCoordinator::set_wake_channel_connected(self, connected);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WakeListenerConfig {
    pub min_backoff: Duration,
    pub max_backoff: Duration,
    /// How often a backoff wait checks the stop flag.
    pub stop_poll: Duration,
}

impl Default for WakeListenerConfig {
    fn default() -> Self {
        Self {
            min_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(60),
            stop_poll: Duration::from_millis(250),
        }
    }
}

/// The running listener thread. Dropping the handle does not stop it; call
/// [`WakeListener::stop`].
pub struct WakeListener {
    stop: Arc<AtomicBool>,
}

impl WakeListener {
    /// Starts the listener on its own thread. `token` is read on every
    /// connect, so a refreshed session reaches the next handshake.
    pub fn spawn<T: WakeTarget + 'static>(
        connector: Arc<dyn WakeConnector>,
        url: String,
        token: Arc<std::sync::RwLock<String>>,
        target: Weak<T>,
        stop: Arc<AtomicBool>,
        config: WakeListenerConfig,
    ) -> Self {
        let listener_stop = Arc::clone(&stop);
        let spawned = thread::Builder::new()
            .name("skriuw-sync-push".into())
            .spawn(move || {
                run_wake_listener(
                    connector.as_ref(),
                    &url,
                    &token,
                    &target,
                    &listener_stop,
                    config,
                );
            });
        if let Err(error) = spawned {
            eprintln!("sync push listener could not start: {error}");
        }
        Self { stop }
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

enum ListenerSession {
    Reconnect,
    Exit,
}

/// Runs the listener on the calling thread until it exits.
pub fn run_wake_listener<T: WakeTarget>(
    connector: &dyn WakeConnector,
    url: &str,
    token: &std::sync::RwLock<String>,
    target: &Weak<T>,
    stop: &AtomicBool,
    config: WakeListenerConfig,
) {
    let mut backoff = config.min_backoff;
    loop {
        if stop.load(Ordering::Relaxed) || target.strong_count() == 0 {
            return;
        }
        let current_token = token.read().map(|token| token.clone()).unwrap_or_default();
        match connector.connect(url, &current_token) {
            Ok(mut socket) => {
                backoff = config.min_backoff;
                report_channel(target, true);
                let session = listen_for_wakes(socket.as_mut(), target, stop);
                report_channel(target, false);
                if let ListenerSession::Exit = session {
                    return;
                }
            }
            Err(WakeConnectError::Rejected(status)) => {
                eprintln!("sync push listener was rejected ({status}); waiting for a new session");
                return;
            }
            Err(WakeConnectError::Failed(error)) => {
                eprintln!("sync push listener connection failed: {error}");
            }
        }
        let mut waited = Duration::ZERO;
        while waited < backoff {
            if stop.load(Ordering::Relaxed) || target.strong_count() == 0 {
                return;
            }
            thread::sleep(config.stop_poll);
            waited += config.stop_poll;
        }
        backoff = (backoff * 2).min(config.max_backoff);
    }
}

fn report_channel<T: WakeTarget>(target: &Weak<T>, connected: bool) {
    if let Some(target) = target.upgrade() {
        target.set_wake_channel_connected(connected);
    }
}

fn listen_for_wakes<T: WakeTarget>(
    socket: &mut dyn WakeSocket,
    target: &Weak<T>,
    stop: &AtomicBool,
) -> ListenerSession {
    loop {
        if stop.load(Ordering::Relaxed) {
            socket.close();
            return ListenerSession::Exit;
        }
        match socket.read() {
            WakeFrame::Text(text) => {
                if is_workspace_changed_message(&text) {
                    let Some(target) = target.upgrade() else {
                        return ListenerSession::Exit;
                    };
                    target.notify_remote_change();
                }
            }
            WakeFrame::Idle => {
                if !socket.keepalive() {
                    return ListenerSession::Reconnect;
                }
            }
            WakeFrame::Ignored => {}
            WakeFrame::Closed => return ListenerSession::Reconnect,
        }
    }
}

/// True for the service's `{"type":"workspaceChanged"}` wake message.
#[must_use]
pub fn is_workspace_changed_message(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|value| {
            value
                .get("type")
                .and_then(|kind| kind.as_str())
                .map(|kind| kind == "workspaceChanged")
        })
        .unwrap_or(false)
}

/// The WebSocket form of an events URL built by
/// [`crate::SyncHttpEndpoints::events`].
pub fn websocket_url(http_url: &str) -> Result<String, String> {
    if let Some(rest) = http_url.strip_prefix("https://") {
        return Ok(format!("wss://{rest}"));
    }
    if let Some(rest) = http_url.strip_prefix("http://") {
        return Ok(format!("ws://{rest}"));
    }
    if http_url.starts_with("wss://") || http_url.starts_with("ws://") {
        return Ok(http_url.to_string());
    }
    Err(format!("cloud URL has no recognized scheme: {http_url}"))
}

#[cfg(test)]
mod tests {
    use std::{
        collections::VecDeque,
        sync::{
            Arc, Mutex, RwLock,
            atomic::{AtomicBool, AtomicUsize, Ordering},
        },
        time::Duration,
    };

    use super::{
        WakeConnectError, WakeConnector, WakeFrame, WakeListenerConfig, WakeSocket, WakeTarget,
        is_workspace_changed_message, run_wake_listener, websocket_url,
    };

    #[derive(Default)]
    struct RecordingTarget {
        wakes: AtomicUsize,
        channel: Mutex<Vec<bool>>,
    }

    impl WakeTarget for RecordingTarget {
        fn notify_remote_change(&self) {
            self.wakes.fetch_add(1, Ordering::SeqCst);
        }

        fn set_wake_channel_connected(&self, connected: bool) {
            self.channel.lock().expect("channel").push(connected);
        }
    }

    struct ScriptedSocket {
        frames: VecDeque<WakeFrame>,
        stop_when_drained: Arc<AtomicBool>,
    }

    impl WakeSocket for ScriptedSocket {
        fn read(&mut self) -> WakeFrame {
            self.frames.pop_front().unwrap_or_else(|| {
                self.stop_when_drained.store(true, Ordering::SeqCst);
                WakeFrame::Idle
            })
        }

        fn keepalive(&mut self) -> bool {
            true
        }

        fn close(&mut self) {}
    }

    enum Attempt {
        Fail,
        Reject,
        Open(Vec<WakeFrame>),
    }

    struct ScriptedConnector {
        attempts: Mutex<VecDeque<Attempt>>,
        tokens: Mutex<Vec<String>>,
        stop: Arc<AtomicBool>,
    }

    impl WakeConnector for ScriptedConnector {
        fn connect(
            &self,
            _url: &str,
            token: &str,
        ) -> Result<Box<dyn WakeSocket>, WakeConnectError> {
            self.tokens.lock().expect("tokens").push(token.into());
            match self.attempts.lock().expect("attempts").pop_front() {
                Some(Attempt::Open(frames)) => Ok(Box::new(ScriptedSocket {
                    frames: frames.into(),
                    stop_when_drained: Arc::clone(&self.stop),
                })),
                Some(Attempt::Reject) => Err(WakeConnectError::Rejected(401)),
                Some(Attempt::Fail) | None => Err(WakeConnectError::Failed("down".into())),
            }
        }
    }

    fn fast() -> WakeListenerConfig {
        WakeListenerConfig {
            min_backoff: Duration::from_millis(1),
            max_backoff: Duration::from_millis(4),
            stop_poll: Duration::from_millis(1),
        }
    }

    fn connector(attempts: Vec<Attempt>, stop: &Arc<AtomicBool>) -> ScriptedConnector {
        ScriptedConnector {
            attempts: Mutex::new(attempts.into()),
            tokens: Mutex::new(Vec::new()),
            stop: Arc::clone(stop),
        }
    }

    #[test]
    fn a_change_message_wakes_the_target_and_others_do_not() {
        let target = Arc::new(RecordingTarget::default());
        let stop = Arc::new(AtomicBool::new(false));
        let connector = connector(
            vec![
                Attempt::Fail,
                Attempt::Open(vec![
                    WakeFrame::Text(r#"{"type":"workspaceChanged"}"#.into()),
                    WakeFrame::Text(r#"{"type":"hello"}"#.into()),
                    WakeFrame::Ignored,
                ]),
            ],
            &stop,
        );

        run_wake_listener(
            &connector,
            "wss://sync.skriuw.app/events",
            &RwLock::new("token".into()),
            &Arc::downgrade(&target),
            &stop,
            fast(),
        );

        assert_eq!(target.wakes.load(Ordering::SeqCst), 1);
        assert_eq!(*target.channel.lock().expect("channel"), vec![true, false]);
        assert_eq!(connector.tokens.lock().expect("tokens").len(), 2);
    }

    #[test]
    fn a_rejected_session_ends_the_listener_without_retrying() {
        let target = Arc::new(RecordingTarget::default());
        let stop = Arc::new(AtomicBool::new(false));
        let connector = connector(vec![Attempt::Reject, Attempt::Fail], &stop);

        run_wake_listener(
            &connector,
            "wss://sync.skriuw.app/events",
            &RwLock::new("token".into()),
            &Arc::downgrade(&target),
            &stop,
            fast(),
        );

        assert_eq!(connector.tokens.lock().expect("tokens").len(), 1);
        assert!(target.channel.lock().expect("channel").is_empty());
    }

    #[test]
    fn a_dropped_target_ends_the_listener() {
        let target = Arc::new(RecordingTarget::default());
        let weak = Arc::downgrade(&target);
        drop(target);
        let stop = Arc::new(AtomicBool::new(false));
        let connector = connector(vec![Attempt::Fail], &stop);

        run_wake_listener(
            &connector,
            "wss://sync.skriuw.app/events",
            &RwLock::new("token".into()),
            &weak,
            &stop,
            fast(),
        );

        assert!(connector.tokens.lock().expect("tokens").is_empty());
    }

    #[test]
    fn wake_messages_and_urls_are_recognized() {
        assert!(is_workspace_changed_message(
            r#"{"type":"workspaceChanged"}"#
        ));
        assert!(!is_workspace_changed_message("ping"));
        assert_eq!(
            websocket_url("https://sync.skriuw.app/v1").as_deref(),
            Ok("wss://sync.skriuw.app/v1")
        );
        assert_eq!(
            websocket_url("http://localhost:8787").as_deref(),
            Ok("ws://localhost:8787")
        );
        assert!(websocket_url("ftp://x").is_err());
    }
}
