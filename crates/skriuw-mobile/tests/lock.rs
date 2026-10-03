//! The note lock through the foreign-function boundary: the same
//! `NoteLockAccess` use cases the desktop commands call, run against native
//! SQLite on the host.

use std::{path::Path, sync::Arc};

use serde_json::{Value, json};
use skriuw_mobile::{MobileError, MobileWorkspace, NoteLockSecret, workspace_protocol_version};
use tempfile::tempdir;

fn open(directory: &Path) -> Arc<MobileWorkspace> {
    MobileWorkspace::open(directory.to_string_lossy().into_owned()).expect("workspace must open")
}

fn operation(operation: Value) -> String {
    json!([{ "protocolVersion": workspace_protocol_version(), "operation": operation }]).to_string()
}

fn create_note(id: &str, markdown: &str) -> String {
    operation(json!({
        "type": "create_note",
        "id": id,
        "title": "Plans",
        "placement": { "parentId": null, "position": { "type": "last" } },
        "documentJson": {
            "type": "doc",
            "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": markdown }] }],
        },
        "markdown": markdown,
        "at": 1_700_000_000_000i64,
    }))
}

fn set_locked(id: &str, locked: bool) -> String {
    operation(json!({
        "type": "set_node_locked",
        "id": id,
        "locked": locked,
        "at": 1_700_000_000_100i64,
    }))
}

fn pin(secret: &str) -> NoteLockSecret {
    NoteLockSecret {
        kind: "pin".into(),
        secret: secret.into(),
        hint: Some("the usual".into()),
    }
}

fn parse(payload: &str) -> Value {
    serde_json::from_str(payload).expect("payload must be contract JSON")
}

fn state(workspace: &MobileWorkspace) -> Value {
    parse(&workspace.note_lock_state().expect("state must read"))
}

fn rejected_detail(result: Result<String, MobileError>) -> String {
    match result {
        Err(MobileError::Rejected { detail }) => detail,
        other => panic!("expected a rejection, got {other:?}"),
    }
}

#[test]
fn a_locked_note_is_sealed_after_relock_and_reopen_and_opens_with_the_pin() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());
    assert_eq!(state(&workspace)["configured"], false);

    workspace
        .submit_operations(create_note("note-1", "launch plans"))
        .expect("note must be created");
    let recovery_code = workspace
        .configure_note_lock(pin("2468"))
        .expect("lock must configure");
    assert!(!recovery_code.is_empty());

    let configured = state(&workspace);
    assert_eq!(configured["configured"], true);
    assert_eq!(configured["unlocked"], true);
    assert_eq!(configured["kind"], "pin");
    assert_eq!(configured["hint"], "the usual");

    workspace
        .submit_operations(set_locked("note-1", true))
        .expect("note must lock");
    assert_eq!(
        parse(&workspace.relock_note_lock().expect("relock"))["unlocked"],
        false
    );
    workspace.shutdown().expect("workspace must shut down");

    let reopened = open(directory.path());
    let snapshot = parse(&reopened.bootstrap().expect("snapshot must read"));
    let sealed = snapshot["documents"]
        .as_array()
        .expect("snapshot carries documents")
        .iter()
        .find(|document| document["noteId"] == "note-1")
        .expect("the locked note is in the snapshot");
    assert!(sealed["sealed"].is_object());
    assert_eq!(sealed["markdown"], "");
    assert_eq!(state(&reopened)["unlocked"], false);
    assert!(matches!(
        reopened.read_locked_documents(None),
        Err(MobileError::Rejected { .. })
    ));

    let unlocked = parse(&reopened.unlock_note_lock("2468".into()).expect("unlock"));
    assert_eq!(unlocked["unlocked"], true);
    let opened = parse(
        &reopened
            .read_locked_documents(Some(vec!["note-1".into()]))
            .expect("locked documents must read"),
    );
    assert_eq!(opened[0]["noteId"], "note-1");
    assert_eq!(opened[0]["markdown"], "launch plans");
}

#[test]
fn a_wrong_pin_is_counted_and_reported_in_the_cores_words() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());
    workspace
        .configure_note_lock(pin("2468"))
        .expect("lock must configure");
    workspace.relock_note_lock().expect("relock");

    let detail = rejected_detail(workspace.unlock_note_lock("1111".into()));
    assert!(detail.starts_with("Wrong PIN"), "{detail}");
    assert_eq!(state(&workspace)["failedAttempts"], 1);
    assert_eq!(state(&workspace)["unlocked"], false);
}

#[test]
fn the_recovery_code_installs_a_new_secret() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());
    let recovery_code = workspace
        .configure_note_lock(pin("2468"))
        .expect("lock must configure");
    workspace.relock_note_lock().expect("relock");

    let passphrase = NoteLockSecret {
        kind: "passphrase".into(),
        secret: "correct horse".into(),
        hint: None,
    };
    let recovered = parse(
        &workspace
            .recover_note_lock(recovery_code, passphrase)
            .expect("recovery must succeed"),
    );
    assert_eq!(recovered["unlocked"], true);
    assert_eq!(recovered["kind"], "passphrase");

    workspace.relock_note_lock().expect("relock");
    assert!(workspace.unlock_note_lock("2468".into()).is_err());
    workspace
        .unlock_note_lock("correct horse".into())
        .expect("the new secret opens the lock");
}

#[test]
fn changing_and_removing_the_lock_need_an_open_session() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());
    workspace
        .submit_operations(create_note("note-1", "launch plans"))
        .expect("note must be created");
    workspace
        .configure_note_lock(pin("2468"))
        .expect("lock must configure");
    workspace
        .submit_operations(set_locked("note-1", true))
        .expect("note must lock");
    workspace.relock_note_lock().expect("relock");

    assert!(matches!(
        workspace.change_note_lock_secret(pin("1357")),
        Err(MobileError::Rejected { .. })
    ));
    assert!(matches!(
        workspace.remove_note_lock(),
        Err(MobileError::Rejected { .. })
    ));

    workspace.unlock_note_lock("2468".into()).expect("unlock");
    workspace
        .change_note_lock_secret(pin("1357"))
        .expect("secret must change");
    let ack = parse(&workspace.remove_note_lock().expect("lock must be removed"));
    assert!(ack["applied"].as_u64().expect("ack counts operations") >= 1);
    assert_eq!(state(&workspace)["configured"], false);

    let snapshot = parse(&workspace.bootstrap().expect("snapshot must read"));
    let document = snapshot["documents"]
        .as_array()
        .expect("snapshot carries documents")
        .iter()
        .find(|document| document["noteId"] == "note-1")
        .expect("the note is in the snapshot");
    assert_eq!(document["markdown"], "launch plans");
    assert!(document["sealed"].is_null());
}

#[test]
fn an_unknown_secret_kind_is_refused_before_storage() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());
    let secret = NoteLockSecret {
        kind: "pattern".into(),
        secret: "2468".into(),
        hint: None,
    };
    assert!(matches!(
        workspace.configure_note_lock(secret),
        Err(MobileError::InvalidPayload { .. })
    ));
    assert_eq!(state(&workspace)["configured"], false);
}

#[test]
fn lock_calls_after_shutdown_report_closed() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());
    workspace.shutdown().expect("workspace must shut down");
    assert!(matches!(
        workspace.note_lock_state(),
        Err(MobileError::Closed)
    ));
    assert!(matches!(
        workspace.unlock_note_lock("2468".into()),
        Err(MobileError::Closed)
    ));
}

#[test]
fn the_secret_never_appears_in_debug_output() {
    let rendered = format!("{:?}", pin("2468"));
    assert!(!rendered.contains("2468"));
}
