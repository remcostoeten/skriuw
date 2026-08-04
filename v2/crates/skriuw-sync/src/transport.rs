use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use skriuw_domain::{SyncPullResponse, SyncPushRequest, SyncPushResponse};
use thiserror::Error;

/// Cancellation signal shared between the coordinator and in-flight transport
/// calls. `shutdown` is permanent; `interrupt` is cleared at the start of the
/// next cycle so logout or session expiry stops the current network call
/// without disabling future work.
#[derive(Clone, Default)]
pub struct SyncCancellation {
    shutdown: Arc<AtomicBool>,
    interrupt: Arc<AtomicBool>,
}

impl SyncCancellation {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        self.shutdown.load(Ordering::SeqCst) || self.interrupt.load(Ordering::SeqCst)
    }

    #[must_use]
    pub fn is_shutdown(&self) -> bool {
        self.shutdown.load(Ordering::SeqCst)
    }

    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
    }

    pub fn interrupt(&self) {
        self.interrupt.store(true, Ordering::SeqCst);
    }

    pub fn clear_interrupt(&self) {
        self.interrupt.store(false, Ordering::SeqCst);
    }
}

/// Stable classification of transport failures. The coordinator's retry,
/// pause, and status behavior depends only on this classification, never on
/// message strings.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum TransportError {
    #[error("sync session is missing or expired")]
    AuthenticationRequired,
    #[error("device is not authorized for this workspace")]
    AuthorizationDenied,
    #[error("sync request was rejected as invalid: {0}")]
    Validation(String),
    #[error("sync request conflicts with the server log: {0}")]
    Conflict(String),
    #[error("sync request was rate limited")]
    RateLimited { retry_after_ms: Option<i64> },
    #[error("transient sync transport failure: {0}")]
    Transient(String),
    #[error("sync server failure")]
    Server { retry_after_ms: Option<i64> },
    #[error("sync request was cancelled")]
    Cancelled,
    #[error("unsupported sync protocol version {0}")]
    UnsupportedProtocol(u16),
}

impl TransportError {
    #[must_use]
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::RateLimited { .. } | Self::Transient(_) | Self::Server { .. }
        )
    }

    #[must_use]
    pub fn retry_hint_ms(&self) -> Option<i64> {
        match self {
            Self::RateLimited { retry_after_ms } | Self::Server { retry_after_ms } => {
                *retry_after_ms
            }
            _ => None,
        }
    }
}

/// Narrow push/pull boundary around the generated v1 sync contracts.
///
/// Implementations own connection handling, authentication material, and
/// bounded request timeouts. Request and batch sizes are bounded by the domain
/// contract (`MAX_SYNC_BATCH_OPERATIONS`, `MAX_SYNC_BATCH_BYTES`,
/// `MAX_SYNC_PULL_OPERATIONS`); the coordinator never submits an unvalidated
/// request and never trusts an unvalidated response. Implementations must
/// observe `cancellation` and return `TransportError::Cancelled` promptly.
pub trait SyncTransport: Send + Sync {
    fn push(
        &self,
        workspace_id: &str,
        request: &SyncPushRequest,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPushResponse, TransportError>;

    fn pull(
        &self,
        workspace_id: &str,
        after_server_sequence: u64,
        limit: usize,
        cancellation: &SyncCancellation,
    ) -> Result<SyncPullResponse, TransportError>;
}

/// Millisecond clock seam so cycle behavior, lease expiry, and backoff are
/// deterministic under test.
pub trait SyncClock: Send + Sync {
    fn now_ms(&self) -> i64;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl SyncClock for SystemClock {
    fn now_ms(&self) -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or(0)
    }
}
