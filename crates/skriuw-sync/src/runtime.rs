//! The native sync runtime: one authenticated session per workspace database.
//!
//! It owns everything about a session that does not depend on the platform:
//! credential and origin checks, provisioning and linking, coordinator and
//! wake-listener lifecycle, the maintenance gate that keeps sync away from a
//! database being replaced, and the recovery and encryption use cases. The
//! platform supplies a [`SyncCloud`] (its HTTP client and, optionally, its
//! wake socket), the asset store, and a way to open the workspace database.
//!
//! Every call opens its own short-lived database connection on the caller's
//! thread. Call it from a blocking thread, never from an interaction path.

use std::{
    sync::{
        Arc, Mutex, MutexGuard, RwLock, RwLockReadGuard,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Duration,
};

use skriuw_domain::SyncRecoveryView;
use skriuw_storage::{StorageError, SyncRecovery, WorkspaceMaintenance, WorkspaceSyncQueue};
use thiserror::Error;

use crate::{
    SyncAssetStore, SyncCancellation, SyncClock, SyncCoordinator, SyncCoordinatorConfig,
    SyncHttpEndpoints, SyncStatus, SyncStatusObserver, SyncTransport, SyncWorkspaceObserver,
    enable_workspace_encryption,
    link::{ProvisionFailure, SyncLinkError, SyncProvisioner, plan_sync_link},
    origin::{TrustedCloudOrigin, is_well_formed_session_token},
    unlock_workspace_encryption,
    wake::{WakeConnector, WakeListener, WakeListenerConfig, websocket_url},
};

/// A session credential shared by the transport, the coordinator and the wake
/// listener, so a refreshed credential reaches every later request.
pub type SyncSessionToken = Arc<RwLock<String>>;

/// The platform's way to reach the cloud.
pub trait SyncCloud: Send + Sync {
    type Transport: SyncTransport + SyncProvisioner + 'static;

    /// Builds the transport for one session against an already trusted
    /// origin.
    fn open_transport(
        &self,
        session: SyncSessionToken,
        endpoints: SyncHttpEndpoints,
    ) -> Result<Self::Transport, String>;

    /// The wake socket the runtime keeps open while a session runs, or `None`
    /// when the platform drives its own wake channel.
    fn wake_connector(&self) -> Option<Arc<dyn WakeConnector>>;
}

/// The storage a runtime drives: the durable sync queue, the maintenance
/// port remote changes apply through, and the recovery surface.
pub trait SyncWorkspace: WorkspaceSyncQueue + WorkspaceMaintenance + SyncRecovery {}

impl<T: WorkspaceSyncQueue + WorkspaceMaintenance + SyncRecovery> SyncWorkspace for T {}

/// Opens a fresh connection to the workspace database.
pub type SyncWorkspaceOpener<W> = Box<dyn Fn() -> Result<W, StorageError> + Send + Sync>;

/// Why a runtime call did nothing. The messages are the ones the desktop
/// settings surface shows; other platforms map the variants to their own
/// error types.
#[derive(Debug, Error)]
pub enum SyncRuntimeError {
    #[error("a valid account session is required to enable sync")]
    InvalidSession,
    #[error(
        "sync is paused while a backup is restored or an archive is imported; try again when it finishes"
    )]
    MaintenanceInProgress,
    #[error("sync runtime lock is unavailable")]
    Unavailable,
    /// The database could not be opened at all. Recovery-relevant: the
    /// platform shows its recovery surface rather than an empty state.
    #[error("could not open the local sync queue: {0}")]
    OpenWorkspace(StorageError),
    #[error("{action}: {source}")]
    Storage {
        action: &'static str,
        source: StorageError,
    },
    #[error("{0}")]
    Transport(String),
    #[error(transparent)]
    Provision(ProvisionFailure),
    #[error("cloud provisioning returned a different device identity")]
    ProvisionedDeviceMismatch,
    #[error(
        "This local workspace is linked to another cloud workspace. Sign back into its original account and cloud environment, or open a fresh local workspace before linking a different account."
    )]
    WorkspaceMismatch { linked: String, account: String },
    #[error("sign in to Skriuw cloud before changing encryption")]
    CloudSessionRequired,
    #[error("sync is not connected")]
    NotConnected,
    #[error("{0}")]
    Encryption(String),
}

impl SyncRuntimeError {
    fn storage(action: &'static str) -> impl FnOnce(StorageError) -> Self {
        move |source| Self::Storage { action, source }
    }
}

/// What a platform configures once, when it creates the runtime.
pub struct SyncRuntimeConfig {
    pub clock: Arc<dyn SyncClock>,
    pub assets: Arc<dyn SyncAssetStore>,
    /// Told about every status change, on the coordinator thread.
    pub status_observer: Option<SyncStatusObserver>,
    pub workspace_observer: Option<SyncWorkspaceObserver>,
    pub wake: WakeListenerConfig,
}

/// The encryption facts a settings surface renders. Key material is
/// deliberately absent: no shell needs it and none may hold it.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEncryptionState {
    pub enabled: bool,
    pub linked: bool,
    pub key_id: Option<String>,
    pub sealed_checkpoint_at: Option<i64>,
}

/// The coordinator a successful `connect` started, with the session it was
/// started for so an overlapping `connect` for the same session can reuse it.
struct ActiveSync<T> {
    coordinator: Arc<SyncCoordinator>,
    transport: Arc<T>,
    token: SyncSessionToken,
    endpoints: SyncHttpEndpoints,
    workspace_id: String,
    device_id: String,
    listener: Option<WakeListener>,
}

impl<T> ActiveSync<T> {
    fn serves(&self, token: &str, endpoints: &SyncHttpEndpoints) -> bool {
        self.endpoints == *endpoints
            && self.token.read().is_ok_and(|current| *current == token)
            && self.coordinator.status() != SyncStatus::AuthenticationRequired
    }
}

#[derive(Clone, Copy)]
struct Visibility {
    visible: bool,
    focused: bool,
}

pub struct SyncRuntime<W, C: SyncCloud> {
    open_workspace: SyncWorkspaceOpener<W>,
    cloud: C,
    config: SyncRuntimeConfig,
    connect_gate: Mutex<()>,
    stop_epoch: AtomicU64,
    active: Mutex<Option<ActiveSync<C::Transport>>>,
    visibility: Mutex<Visibility>,
    maintenance: RwLock<u32>,
}

/// Keeps sync stopped and `connect` refused until dropped.
pub struct MaintenanceSuspension<'a> {
    maintenance: &'a RwLock<u32>,
}

impl Drop for MaintenanceSuspension<'_> {
    fn drop(&mut self) {
        let mut suspended = self
            .maintenance
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *suspended = suspended.saturating_sub(1);
    }
}

impl<W, C> SyncRuntime<W, C>
where
    W: SyncWorkspace + 'static,
    C: SyncCloud,
{
    /// Creates an inert runtime. Nothing opens, no thread starts and no
    /// request is made until [`SyncRuntime::connect`].
    #[must_use]
    pub fn new(
        open_workspace: SyncWorkspaceOpener<W>,
        cloud: C,
        config: SyncRuntimeConfig,
    ) -> Self {
        Self {
            open_workspace,
            cloud,
            config,
            connect_gate: Mutex::new(()),
            stop_epoch: AtomicU64::new(0),
            active: Mutex::new(None),
            visibility: Mutex::new(Visibility {
                visible: true,
                focused: true,
            }),
            maintenance: RwLock::new(0),
        }
    }

    #[must_use]
    pub fn status(&self) -> SyncStatus {
        self.active
            .lock()
            .ok()
            .and_then(|active| active.as_ref().map(|active| active.coordinator.status()))
            .unwrap_or(SyncStatus::LocalOnly)
    }

    pub fn notify_local_commit(&self) {
        self.with_coordinator(SyncCoordinator::notify_local_commit);
    }

    pub fn notify_focus(&self) {
        self.with_coordinator(SyncCoordinator::notify_focus);
    }

    pub fn notify_remote_change(&self) {
        self.with_coordinator(SyncCoordinator::notify_remote_change);
    }

    pub fn request_refresh(&self) {
        self.with_coordinator(SyncCoordinator::request_refresh);
    }

    pub fn set_online(&self, online: bool) {
        self.with_coordinator(|coordinator| coordinator.set_online(online));
    }

    pub fn set_wake_channel_connected(&self, connected: bool) {
        self.with_coordinator(|coordinator| coordinator.set_wake_channel_connected(connected));
    }

    /// Forwards to the running coordinator and is remembered, so a session
    /// that starts later polls at the cadence the shell last reported.
    pub fn set_visibility(&self, visible: bool, focused: bool) {
        if let Ok(mut visibility) = self.visibility.lock() {
            *visibility = Visibility { visible, focused };
        }
        self.with_coordinator(|coordinator| coordinator.set_visibility(visible, focused));
    }

    /// Opens (or reopens) the authenticated session against an origin the
    /// platform already checked with [`crate::trusted_cloud_base_url`], so a
    /// compromised shell message cannot point the bearer credential at an
    /// arbitrary host.
    ///
    /// Connects run one at a time, so a startup resume and a shell connect
    /// can never start two coordinators. A connect that waited for an
    /// identical session reuses its coordinator, and one overtaken by a pause
    /// or shutdown stops without starting sync.
    pub fn connect(
        &self,
        token: String,
        origin: TrustedCloudOrigin,
    ) -> Result<SyncStatus, SyncRuntimeError> {
        if !is_well_formed_session_token(&token) {
            return Err(SyncRuntimeError::InvalidSession);
        }
        let endpoints = SyncHttpEndpoints::new(origin.as_str());
        let _connecting = self
            .connect_gate
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let maintenance = self.maintenance_gate()?;
        if let Some(status) = self.reusable_status(&token, &endpoints) {
            return Ok(status);
        }
        self.stop_coordinator();
        let epoch = self.stop_epoch.load(Ordering::SeqCst);

        let queue = Arc::new((self.open_workspace)().map_err(SyncRuntimeError::OpenWorkspace)?);
        let existing = queue.sync_connection().map_err(SyncRuntimeError::storage(
            "could not read the local sync connection",
        ))?;
        let device_id = existing
            .as_ref()
            .map(|connection| connection.device_id.clone())
            .unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string());
        let session: SyncSessionToken = Arc::new(RwLock::new(token));
        let transport = Arc::new(
            self.cloud
                .open_transport(Arc::clone(&session), endpoints.clone())
                .map_err(SyncRuntimeError::Transport)?,
        );
        let provisioned = transport
            .provision(&device_id)
            .map_err(SyncRuntimeError::Provision)?;
        if provisioned.device_id != device_id {
            return Err(SyncRuntimeError::ProvisionedDeviceMismatch);
        }
        let link = plan_sync_link(
            existing.as_ref(),
            &provisioned.workspace_id,
            &device_id,
            self.config.clock.now_ms(),
        )
        .map_err(|error| match error {
            SyncLinkError::WorkspaceMismatch { linked, account } => {
                SyncRuntimeError::WorkspaceMismatch { linked, account }
            }
            SyncLinkError::DeviceMismatch => SyncRuntimeError::ProvisionedDeviceMismatch,
        })?;
        queue
            .connect_sync(&link)
            .map_err(SyncRuntimeError::storage(
                "could not persist the sync connection",
            ))?;

        let listener_stop = Arc::new(AtomicBool::new(false));
        let mut active = self.lock_active()?;
        if self.stop_epoch.load(Ordering::SeqCst) != epoch {
            return Ok(SyncStatus::LocalOnly);
        }
        let coordinator = Arc::new(SyncCoordinator::spawn(
            Arc::clone(&queue) as Arc<dyn WorkspaceSyncQueue>,
            queue,
            Arc::clone(&transport) as Arc<dyn SyncTransport>,
            Arc::clone(&self.config.assets),
            Arc::clone(&self.config.clock),
            SyncCoordinatorConfig {
                workspace_observer: self.config.workspace_observer.clone(),
                status_observer: Some(self.status_observer(Arc::clone(&listener_stop))),
                session_token: Some(Arc::clone(&session)),
                ..SyncCoordinatorConfig::default()
            },
        ));
        if let Ok(visibility) = self.visibility.lock()
            && !(visibility.visible && visibility.focused)
        {
            coordinator.set_visibility(visibility.visible, visibility.focused);
        }
        let status = coordinator.status();
        let listener = self.spawn_listener(
            &endpoints,
            &link.workspace_id,
            &link.device_id,
            &session,
            &coordinator,
            listener_stop,
        );
        *active = Some(ActiveSync {
            coordinator,
            transport,
            token: session,
            endpoints,
            workspace_id: link.workspace_id,
            device_id: link.device_id,
            listener,
        });
        drop(active);
        drop(maintenance);
        Ok(status)
    }

    /// Installs a refreshed credential into the running session without
    /// reconnecting.
    pub fn refresh_session(&self, token: &str) -> Result<SyncStatus, SyncRuntimeError> {
        if !is_well_formed_session_token(token) {
            return Err(SyncRuntimeError::InvalidSession);
        }
        let coordinator = self
            .lock_active()?
            .as_ref()
            .map(|active| Arc::clone(&active.coordinator))
            .ok_or(SyncRuntimeError::NotConnected)?;
        coordinator.resume_with_session(token);
        Ok(coordinator.status())
    }

    /// Where the session's wake channel connects, for a platform that runs
    /// its own. `None` while nothing is connected.
    #[must_use]
    pub fn wake_channel_url(&self) -> Option<String> {
        let active = self.active.lock().ok()?;
        let active = active.as_ref()?;
        Some(
            active
                .endpoints
                .events(&active.workspace_id, &active.device_id),
        )
    }

    /// Cloud workspace this local store has already been linked to, if any.
    pub fn linked_workspace_id(&self) -> Result<Option<String>, SyncRuntimeError> {
        self.with_workspace(|workspace| {
            Ok(workspace
                .sync_connection()
                .map_err(SyncRuntimeError::storage(
                    "could not read the local sync connection",
                ))?
                .map(|connection| connection.workspace_id))
        })
    }

    /// Lists the blocked sync queue for the recovery surface.
    pub fn recovery_view(&self) -> Result<SyncRecoveryView, SyncRuntimeError> {
        self.with_workspace(|workspace| {
            workspace
                .sync_recovery_view()
                .map_err(SyncRuntimeError::storage(
                    "could not read the blocked sync queue",
                ))
        })
    }

    pub fn retry_blocked_operation(
        &self,
        blocked_id: &str,
    ) -> Result<SyncRecoveryView, SyncRuntimeError> {
        self.with_workspace(|workspace| {
            workspace
                .retry_blocked_sync_operation(blocked_id, self.config.clock.now_ms())
                .map_err(SyncRuntimeError::storage(
                    "could not retry the blocked change",
                ))?;
            self.request_refresh();
            workspace
                .sync_recovery_view()
                .map_err(SyncRuntimeError::storage(
                    "could not read the blocked sync queue",
                ))
        })
    }

    pub fn discard_blocked_operation(
        &self,
        blocked_id: &str,
    ) -> Result<SyncRecoveryView, SyncRuntimeError> {
        self.with_workspace(|workspace| {
            workspace
                .discard_blocked_sync_operation(blocked_id, self.config.clock.now_ms())
                .map_err(SyncRuntimeError::storage(
                    "could not discard the blocked change",
                ))?;
            self.request_refresh();
            workspace
                .sync_recovery_view()
                .map_err(SyncRuntimeError::storage(
                    "could not read the blocked sync queue",
                ))
        })
    }

    pub fn encryption_state(&self) -> Result<WorkspaceEncryptionState, SyncRuntimeError> {
        self.with_workspace(|workspace| {
            let seal = workspace
                .workspace_seal()
                .map_err(SyncRuntimeError::storage(
                    "could not read the workspace encryption state",
                ))?;
            let linked = workspace
                .sync_connection()
                .map_err(SyncRuntimeError::storage(
                    "could not read the local sync connection",
                ))?
                .is_some();
            Ok(WorkspaceEncryptionState {
                enabled: seal.is_some(),
                linked,
                key_id: seal.as_ref().map(|seal| seal.key_id.clone()),
                sealed_checkpoint_at: seal.as_ref().and_then(|seal| seal.sealed_checkpoint_at),
            })
        })
    }

    /// Turns encryption on and returns the recovery code exactly once. The
    /// code is never stored: only the key it derives is. `entropy` is the
    /// platform's randomness for the code.
    pub fn enable_encryption(&self, entropy: &[u8]) -> Result<String, SyncRuntimeError> {
        let recovery_code = self.with_workspace(|workspace| {
            let transport = self.cloud_transport()?;
            enable_workspace_encryption(
                workspace,
                transport.as_ref(),
                &SyncCancellation::new(),
                entropy,
                self.config.clock.now_ms(),
            )
            .map_err(SyncRuntimeError::Encryption)
        })?;
        self.request_refresh();
        Ok(recovery_code)
    }

    /// Joins an already-encrypted workspace. The code is checked against the
    /// key the cloud recorded before anything is stored.
    pub fn unlock_encryption(&self, recovery_code: &str) -> Result<(), SyncRuntimeError> {
        self.with_workspace(|workspace| {
            let transport = self.cloud_transport()?;
            unlock_workspace_encryption(
                workspace,
                transport.as_ref(),
                &SyncCancellation::new(),
                recovery_code,
                self.config.clock.now_ms(),
            )
            .map_err(SyncRuntimeError::Encryption)
        })?;
        self.request_refresh();
        Ok(())
    }

    /// Stops network access without discarding the durable connection or
    /// outbox. Reconnecting is a new [`SyncRuntime::connect`].
    pub fn pause(&self) -> SyncStatus {
        self.stop_coordinator();
        self.status()
    }

    pub fn shutdown(&self) {
        self.stop_coordinator();
    }

    /// Stops sync but waits at most `limit` for the worker, so quitting never
    /// hangs on an in-flight request. Returns false when the worker was left
    /// for process exit to reclaim.
    pub fn shutdown_within(&self, limit: Duration) -> bool {
        self.take_coordinator()
            .is_none_or(|coordinator| coordinator.shutdown_within(limit))
    }

    /// Stops sync and refuses `connect` and every workspace call until the
    /// returned guard drops. Waits for an in-flight call to release the
    /// database first, so call it from a blocking thread.
    #[must_use]
    pub fn suspend_for_maintenance(&self) -> MaintenanceSuspension<'_> {
        {
            let mut suspended = self
                .maintenance
                .write()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            *suspended = suspended.saturating_add(1);
        }
        self.stop_coordinator();
        MaintenanceSuspension {
            maintenance: &self.maintenance,
        }
    }

    fn status_observer(&self, listener_stop: Arc<AtomicBool>) -> SyncStatusObserver {
        let forward = self.config.status_observer.clone();
        Arc::new(move |status: &SyncStatus| {
            if *status == SyncStatus::AuthenticationRequired {
                listener_stop.store(true, Ordering::Relaxed);
            }
            if let Some(forward) = &forward {
                forward(status);
            }
        })
    }

    fn spawn_listener(
        &self,
        endpoints: &SyncHttpEndpoints,
        workspace_id: &str,
        device_id: &str,
        session: &SyncSessionToken,
        coordinator: &Arc<SyncCoordinator>,
        stop: Arc<AtomicBool>,
    ) -> Option<WakeListener> {
        let connector = self.cloud.wake_connector()?;
        let url = match websocket_url(&endpoints.events(workspace_id, device_id)) {
            Ok(url) => url,
            Err(error) => {
                eprintln!("sync push listener could not start: {error}");
                return None;
            }
        };
        Some(WakeListener::spawn(
            connector,
            url,
            Arc::clone(session),
            Arc::downgrade(coordinator),
            stop,
            self.config.wake,
        ))
    }

    fn reusable_status(&self, token: &str, endpoints: &SyncHttpEndpoints) -> Option<SyncStatus> {
        let active = self.active.lock().ok()?;
        let active = active
            .as_ref()
            .filter(|active| active.serves(token, endpoints))?;
        Some(active.coordinator.status())
    }

    fn lock_active(
        &self,
    ) -> Result<MutexGuard<'_, Option<ActiveSync<C::Transport>>>, SyncRuntimeError> {
        self.active
            .lock()
            .map_err(|_| SyncRuntimeError::Unavailable)
    }

    fn maintenance_gate(&self) -> Result<RwLockReadGuard<'_, u32>, SyncRuntimeError> {
        let maintenance = self
            .maintenance
            .read()
            .map_err(|_| SyncRuntimeError::Unavailable)?;
        if *maintenance != 0 {
            return Err(SyncRuntimeError::MaintenanceInProgress);
        }
        Ok(maintenance)
    }

    /// Runs `action` on a short-lived connection while holding the
    /// maintenance gate, so a restore or import waits for it and it refuses
    /// during one.
    pub fn with_workspace<T>(
        &self,
        action: impl FnOnce(&W) -> Result<T, SyncRuntimeError>,
    ) -> Result<T, SyncRuntimeError> {
        let _maintenance = self.maintenance_gate()?;
        let workspace = (self.open_workspace)().map_err(SyncRuntimeError::OpenWorkspace)?;
        action(&workspace)
    }

    fn cloud_transport(&self) -> Result<Arc<C::Transport>, SyncRuntimeError> {
        self.lock_active()?
            .as_ref()
            .map(|active| Arc::clone(&active.transport))
            .ok_or(SyncRuntimeError::CloudSessionRequired)
    }

    fn stop_coordinator(&self) {
        if let Some(coordinator) = self.take_coordinator() {
            coordinator.shutdown();
        }
    }

    fn take_coordinator(&self) -> Option<Arc<SyncCoordinator>> {
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        self.stop_epoch.fetch_add(1, Ordering::SeqCst);
        let active = active.take()?;
        if let Some(listener) = &active.listener {
            listener.stop();
        }
        Some(active.coordinator)
    }

    fn with_coordinator(&self, action: impl Fn(&SyncCoordinator)) {
        if let Ok(active) = self.active.lock()
            && let Some(active) = active.as_ref()
        {
            action(active.coordinator.as_ref());
        }
    }
}

impl<W, C: SyncCloud> Drop for SyncRuntime<W, C> {
    fn drop(&mut self) {
        let active = self
            .active
            .get_mut()
            .map(Option::take)
            .unwrap_or_else(|poisoned| poisoned.into_inner().take());
        if let Some(active) = active {
            if let Some(listener) = &active.listener {
                listener.stop();
            }
            active.coordinator.shutdown();
        }
    }
}
