//! Host coverage for sign-in, per-account workspaces and the sync lifecycle
//! (`docs/specs/mobile-app.md`, R-F6 and R-Q1).
//!
//! Everything here runs on Linux against the same native SQLite and the same
//! routing code the Android and iOS builds link, so the account-isolation and
//! session outcomes are proven without a device. What a device still has to
//! prove is the platform network implementation and the emulator end-to-end
//! convergence run, which is stated as unverified rather than implied here.

use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use skriuw_mobile::{
    MobileError, MobileSync, MobileSyncNetwork, MobileWorkspace, SlotAdoption, SyncRequest,
    SyncResponse, active_workspace_directory, adopt_workspace_slot, workspace_protocol_version,
};
use tempfile::{TempDir, tempdir};

const ACCOUNT_ONE: &str = "w_a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const ACCOUNT_TWO: &str = "w_b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";

/// A cloud that answers provisioning for whichever account the test names and
/// refuses everything else, so the coordinator's own cycles stay transient
/// failures and never change durable state behind an assertion.
struct ScriptedCloud {
    workspace_id: String,
    sent: Mutex<Vec<SyncRequest>>,
}

impl ScriptedCloud {
    fn new(workspace_id: &str) -> Arc<Self> {
        Arc::new(Self {
            workspace_id: workspace_id.to_owned(),
            sent: Mutex::new(Vec::new()),
        })
    }

    fn provisioned_device_ids(&self) -> Vec<String> {
        self.sent
            .lock()
            .expect("sent")
            .iter()
            .filter(|request| request.url.ends_with("/v1/sync/provision"))
            .filter_map(|request| {
                serde_json::from_slice::<Value>(&request.body)
                    .ok()?
                    .get("deviceId")?
                    .as_str()
                    .map(str::to_owned)
            })
            .collect()
    }

    fn provisioned_bearers(&self) -> Vec<String> {
        self.sent
            .lock()
            .expect("sent")
            .iter()
            .filter(|request| request.url.ends_with("/v1/sync/provision"))
            .map(|request| request.bearer.clone())
            .collect()
    }
}

impl MobileSyncNetwork for ScriptedCloud {
    fn send(&self, request: SyncRequest) -> Result<SyncResponse, MobileError> {
        let provisioning = request.url.ends_with("/v1/sync/provision");
        let device_id = serde_json::from_slice::<Value>(&request.body)
            .ok()
            .and_then(|body| body.get("deviceId")?.as_str().map(str::to_owned))
            .unwrap_or_default();
        self.sent.lock().expect("sent").push(request);
        if !provisioning {
            return Ok(SyncResponse::failed("no network in this test"));
        }
        Ok(SyncResponse::completed(
            200,
            json!({ "workspaceId": self.workspace_id, "deviceId": device_id })
                .to_string()
                .into_bytes(),
        ))
    }
}

fn path(directory: &str) -> String {
    format!("{directory}/skriuw.db")
}

fn sync(directory: &str, cloud: Arc<ScriptedCloud>) -> Arc<MobileSync> {
    MobileSync::open(path(directory), cloud, None, None).expect("sync handle")
}

fn base(directory: &TempDir) -> String {
    directory.path().to_string_lossy().into_owned()
}

fn create_note(id: &str, title: &str) -> String {
    json!([{
        "protocolVersion": workspace_protocol_version(),
        "operation": {
            "type": "create_note",
            "id": id,
            "title": title,
            "placement": { "parentId": null, "position": { "type": "last" } },
            "documentJson": { "type": "doc", "content": [] },
            "markdown": "",
            "at": 1_700_000_000_000i64,
        },
    }])
    .to_string()
}

fn titles(directory: &str) -> Vec<String> {
    let workspace = MobileWorkspace::open(directory.to_owned()).expect("workspace must open");
    let snapshot: Value =
        serde_json::from_str(&workspace.bootstrap().expect("snapshot")).expect("contract JSON");
    let titles = snapshot["nodes"]
        .as_array()
        .expect("nodes")
        .iter()
        .filter_map(|node| node["title"].as_str().map(str::to_owned))
        .collect();
    workspace.shutdown().expect("workspace must shut down");
    titles
}

#[test]
fn signing_in_links_the_workspace_and_reuses_one_device_identity() {
    let directory = tempdir().expect("tempdir");
    let cloud = ScriptedCloud::new(ACCOUNT_ONE);
    let sync = sync(&base(&directory), Arc::clone(&cloud));

    sync.connect("session-one".into(), "https://sync.skriuw.app".into())
        .expect("connect");
    assert_eq!(
        sync.linked_workspace_id().expect("linked").as_deref(),
        Some(ACCOUNT_ONE),
    );
    sync.pause();

    // Signing in again on the same store must not register a second device:
    // the protocol sequences by device, and a new identity every launch would
    // leave the cloud acknowledging a device that never comes back.
    sync.connect("session-two".into(), "https://sync.skriuw.app".into())
        .expect("reconnect");
    let devices = cloud.provisioned_device_ids();
    assert_eq!(devices.len(), 2);
    assert_eq!(devices[0], devices[1]);
    assert!(!devices[0].is_empty());
    assert_eq!(
        cloud.provisioned_bearers(),
        vec!["session-one", "session-two"],
    );
    sync.shutdown();
}

#[test]
fn pausing_preserves_the_link_so_a_signed_out_device_keeps_its_work() {
    let directory = tempdir().expect("tempdir");
    let sync = sync(&base(&directory), ScriptedCloud::new(ACCOUNT_ONE));

    sync.connect("session".into(), "https://sync.skriuw.app".into())
        .expect("connect");
    assert_eq!(sync.pause(), r#"{"state":"localOnly"}"#);

    // Durable state survives the pause: the outbox and the connection are what
    // let the same account resume where it left off rather than rehydrate.
    assert_eq!(
        sync.linked_workspace_id().expect("linked").as_deref(),
        Some(ACCOUNT_ONE),
    );
    let encryption: Value =
        serde_json::from_str(&sync.encryption_state().expect("encryption")).expect("json");
    assert_eq!(encryption["linked"], json!(true));
    assert_eq!(encryption["enabled"], json!(false));
    sync.shutdown();
}

#[test]
fn switching_accounts_leaves_no_note_of_the_previous_account_readable() {
    let directory = tempdir().expect("tempdir");
    let storage = base(&directory);

    // The first account signs in on a store that already holds notes. ADR-0046
    // claims it in place, so nothing the user wrote before having an account
    // is lost.
    let first_directory = active_workspace_directory(storage.clone()).expect("directory");
    let workspace = MobileWorkspace::open(first_directory.clone()).expect("workspace");
    workspace
        .submit_operations(create_note("note-1", "Private to account one"))
        .expect("note");
    workspace.shutdown().expect("shutdown");

    let claimed = adopt_workspace_slot(storage.clone(), ACCOUNT_ONE.into(), None).expect("claim");
    assert_eq!(claimed.adoption, SlotAdoption::Claimed);
    assert!(!claimed.reopen_required);
    assert_eq!(titles(&claimed.directory), vec!["Private to account one"]);

    // The second account is routed to its own storage rather than inheriting
    // the first account's.
    let switched = adopt_workspace_slot(
        storage.clone(),
        ACCOUNT_TWO.into(),
        Some(ACCOUNT_ONE.into()),
    )
    .expect("switch");
    assert_eq!(switched.adoption, SlotAdoption::Switched);
    assert!(switched.reopen_required);
    assert_ne!(switched.directory, claimed.directory);
    assert!(titles(&switched.directory).is_empty());

    let second = MobileWorkspace::open(switched.directory.clone()).expect("workspace");
    second
        .submit_operations(create_note("note-2", "Private to account two"))
        .expect("note");
    second.shutdown().expect("shutdown");
    assert_eq!(titles(&switched.directory), vec!["Private to account two"]);

    // And switching back is lossless in both directions.
    let back =
        adopt_workspace_slot(storage, ACCOUNT_ONE.into(), Some(ACCOUNT_TWO.into())).expect("back");
    assert_eq!(back.adoption, SlotAdoption::Switched);
    assert_eq!(back.directory, claimed.directory);
    assert_eq!(titles(&back.directory), vec!["Private to account one"]);
}

#[test]
fn a_second_account_connecting_to_an_unrouted_store_is_refused() {
    let directory = tempdir().expect("tempdir");
    let storage = base(&directory);

    sync(&storage, ScriptedCloud::new(ACCOUNT_ONE))
        .connect("session-one".into(), "https://sync.skriuw.app".into())
        .expect("connect");

    // The routing in `switching_accounts_leaves_no_note_of_the_previous_account_readable`
    // is what keeps this unreachable in normal use. It stays as the backstop
    // that turns a routing bug into a refusal rather than a cross-account
    // write.
    let other = sync(&storage, ScriptedCloud::new(ACCOUNT_TWO));
    let refusal = other
        .connect("session-two".into(), "https://sync.skriuw.app".into())
        .expect_err("must refuse");
    assert!(matches!(
        refusal,
        MobileError::WorkspaceMismatch { ref linked, ref account }
            if linked == ACCOUNT_ONE && account == ACCOUNT_TWO
    ));
    assert_eq!(
        other.linked_workspace_id().expect("linked").as_deref(),
        Some(ACCOUNT_ONE),
    );
}

#[test]
fn the_recovery_surface_is_reachable_on_a_connected_workspace() {
    let directory = tempdir().expect("tempdir");
    let sync = sync(&base(&directory), ScriptedCloud::new(ACCOUNT_ONE));
    sync.connect("session".into(), "https://sync.skriuw.app".into())
        .expect("connect");

    let view: Value =
        serde_json::from_str(&sync.recovery_view().expect("recovery view")).expect("contract JSON");
    assert_eq!(view["viewVersion"], json!(1));
    assert_eq!(view["blocked"], json!([]));
    assert_eq!(view["discarded"], json!([]));

    // A change id the view never offered is refused rather than reported as a
    // successful retry of nothing.
    assert!(sync.retry_blocked_operation("not-a-change".into()).is_err());
    sync.shutdown();
}

#[test]
fn the_wake_channel_url_exists_only_while_a_session_does() {
    let directory = tempdir().expect("tempdir");
    let sync = sync(&base(&directory), ScriptedCloud::new(ACCOUNT_ONE));
    assert_eq!(sync.wake_channel_url(), None);

    sync.connect("session".into(), "https://sync.skriuw.app".into())
        .expect("connect");
    let url = sync.wake_channel_url().expect("connected");
    assert!(url.starts_with("https://sync.skriuw.app/"));
    assert!(url.contains(ACCOUNT_ONE));

    // Pausing retires the channel with the session, which is what keeps a
    // signed-out device from holding an authorized socket open.
    sync.pause();
    assert_eq!(sync.wake_channel_url(), None);
}

#[test]
fn lifecycle_signals_are_safe_in_any_order_and_never_touch_durable_state() {
    let directory = tempdir().expect("tempdir");
    let sync = sync(&base(&directory), ScriptedCloud::new(ACCOUNT_ONE));
    sync.connect("session".into(), "https://sync.skriuw.app".into())
        .expect("connect");

    sync.set_foreground(false);
    sync.background_refresh();
    sync.set_online(false);
    sync.set_foreground(true);
    sync.set_wake_channel_connected(true);
    sync.notify_remote_change();
    sync.set_wake_channel_connected(false);
    sync.note_local_commit();
    sync.catch_up();
    sync.set_online(true);

    assert_eq!(
        sync.linked_workspace_id().expect("linked").as_deref(),
        Some(ACCOUNT_ONE),
    );
    sync.shutdown();
    // Everything is idle-safe after shutdown, which is what an application
    // being suspended mid-gesture looks like.
    sync.catch_up();
    sync.shutdown();
}
