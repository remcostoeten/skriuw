//! Host coverage for the foreign-function boundary. Everything here runs on
//! Linux against the same native SQLite the Android and iOS builds link, so
//! the go/no-go for ADR-0048 does not depend on a device.

use std::{fs, path::Path, sync::Arc, thread};

use serde_json::{Value, json};
use skriuw_mobile::{
    MobileError, MobileWorkspace, SaveDocumentRequest, workspace_protocol_version,
};
use tempfile::tempdir;

const EMPTY_DOCUMENT: &str = r#"{"type":"doc","content":[]}"#;

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

fn save(note_id: &str, markdown: &str, expected_revision: i64) -> SaveDocumentRequest {
    SaveDocumentRequest {
        note_id: note_id.into(),
        document_json: EMPTY_DOCUMENT.into(),
        markdown: markdown.into(),
        expected_revision,
        at: 1_700_000_000_001,
    }
}

fn open(directory: &Path) -> Arc<MobileWorkspace> {
    MobileWorkspace::open(directory.to_string_lossy().into_owned()).expect("workspace must open")
}

fn document(workspace: &MobileWorkspace, note_id: &str) -> Value {
    serde_json::from_str(
        &workspace
            .load_document(note_id.into())
            .expect("document must load"),
    )
    .expect("document must be contract JSON")
}

#[test]
fn a_document_written_before_shutdown_is_there_after_reopen() {
    let directory = tempdir().expect("temporary directory");

    let workspace = open(directory.path());
    workspace
        .submit_operations(create_note("note-1", "Groceries"))
        .expect("note must be created");
    workspace
        .save_document(save("note-1", "milk and bread", 1))
        .expect("document must save");
    workspace.shutdown().expect("workspace must shut down");

    let reopened = open(directory.path());
    let snapshot: Value = serde_json::from_str(&reopened.bootstrap().expect("snapshot must read"))
        .expect("snapshot must be contract JSON");
    let documents = snapshot["documents"]
        .as_array()
        .expect("snapshot carries documents");
    let stored = documents
        .iter()
        .find(|document| document["noteId"] == "note-1")
        .expect("the saved note survived the restart");

    assert_eq!(stored["markdown"], "milk and bread");
    assert_eq!(stored["wordCount"], 3);
    assert_eq!(document(&reopened, "note-1")["markdown"], "milk and bread");
}

#[test]
fn a_stale_save_is_refused_with_both_revisions() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());
    workspace
        .submit_operations(create_note("note-1", "Groceries"))
        .expect("note must be created");
    workspace
        .save_document(save("note-1", "first", 1))
        .expect("first save must apply");

    let stale = workspace.save_document(save("note-1", "second", 1));

    match stale {
        Err(MobileError::Conflict {
            id,
            expected,
            current,
        }) => {
            assert_eq!(id, "note-1");
            assert_eq!(expected, 1);
            assert_eq!(current, 2);
        }
        other => panic!("expected a revision conflict, got {other:?}"),
    }
    assert_eq!(document(&workspace, "note-1")["markdown"], "first");
}

#[test]
fn a_corrupt_database_surfaces_the_recovery_error() {
    let directory = tempdir().expect("temporary directory");
    open(directory.path())
        .shutdown()
        .expect("workspace must shut down");
    fs::write(
        directory.path().join("skriuw.db"),
        b"this is not a SQLite database",
    )
    .expect("corrupt the workspace file");

    let failure = MobileWorkspace::open(directory.path().to_string_lossy().into_owned());

    match failure {
        Err(MobileError::Recovery { detail }) => assert!(!detail.is_empty()),
        Ok(_) => panic!("a corrupt database must not open"),
        Err(other) => panic!("expected a recovery error, got {other:?}"),
    }
}

#[test]
fn an_unknown_note_is_not_found_rather_than_empty() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());

    match workspace.load_document("note-missing".into()) {
        Err(MobileError::NotFound { id }) => assert_eq!(id, "note-missing"),
        other => panic!("expected a not-found error, got {other:?}"),
    }
}

#[test]
fn malformed_payloads_never_reach_storage() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());

    assert!(matches!(
        workspace.submit_operations("not json at all".into()),
        Err(MobileError::InvalidPayload { .. })
    ));
    assert!(matches!(
        workspace.save_document(SaveDocumentRequest {
            document_json: "{".into(),
            ..save("note-1", "body", 0)
        }),
        Err(MobileError::InvalidPayload { .. })
    ));
}

#[test]
fn an_operation_from_another_protocol_version_is_refused() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());
    let future = create_note("note-1", "Groceries").replace(
        &format!("\"protocolVersion\":{}", workspace_protocol_version()),
        "\"protocolVersion\":9999",
    );

    assert!(matches!(
        workspace.submit_operations(future),
        Err(MobileError::Rejected { .. })
    ));
}

#[test]
fn an_unusable_directory_is_reported_before_any_database_work() {
    let directory = tempdir().expect("temporary directory");
    let file = directory.path().join("not-a-directory");
    fs::write(&file, b"").expect("write the blocking file");

    assert!(matches!(
        MobileWorkspace::open(file.to_string_lossy().into_owned()),
        Err(MobileError::Workspace { .. })
    ));
    assert!(matches!(
        MobileWorkspace::open("   ".into()),
        Err(MobileError::Workspace { .. })
    ));
}

#[test]
fn calls_after_shutdown_report_a_closed_workspace() {
    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());
    workspace.shutdown().expect("workspace must shut down");
    workspace
        .shutdown()
        .expect("shutting down twice is not an error");

    assert!(matches!(workspace.bootstrap(), Err(MobileError::Closed)));
    assert!(matches!(
        workspace.load_document("note-1".into()),
        Err(MobileError::Closed)
    ));
    assert!(matches!(
        workspace.submit_operations(create_note("note-1", "Groceries")),
        Err(MobileError::Closed)
    ));
}

#[test]
fn concurrent_callers_are_serialized_without_deadlock() {
    const CALLERS: usize = 8;
    const SAVES_PER_CALLER: i64 = 12;

    let directory = tempdir().expect("temporary directory");
    let workspace = open(directory.path());
    workspace
        .submit_operations(create_note("note-1", "Groceries"))
        .expect("note must be created");

    thread::scope(|scope| {
        for caller in 0..CALLERS {
            let workspace = Arc::clone(&workspace);
            scope.spawn(move || {
                for index in 1..=SAVES_PER_CALLER {
                    // Every caller races for the same note, so all but one
                    // save per revision loses. Both outcomes are acceptable;
                    // a hang, a panic or a torn write is not.
                    match workspace.save_document(save(
                        "note-1",
                        &format!("{caller}-{index}"),
                        index,
                    )) {
                        Ok(_) | Err(MobileError::Conflict { .. }) => {}
                        other => panic!("unexpected boundary result: {other:?}"),
                    }
                    workspace.bootstrap().expect("snapshot must read");
                }
            });
        }
    });

    let revision = document(&workspace, "note-1")["revision"]
        .as_i64()
        .expect("documents carry a revision");
    assert!(revision > 1, "concurrent callers must have written");
}
