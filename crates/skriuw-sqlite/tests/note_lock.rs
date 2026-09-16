use serde_json::json;
use skriuw_domain::{
    NOTE_LOCK_CONFIGURE_ENTROPY_BYTES, NodePlacement, NoteLockKind, WorkspaceOperation,
    WorkspaceOperationEnvelope,
};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{
    ConfigureNoteLockRequest, NoteLockAccess, ReplaceNoteLockSecretRequest, StorageError,
    WorkspaceMaintenance, WorkspaceStorage,
};
use tempfile::tempdir;

fn op(operation: WorkspaceOperation) -> WorkspaceOperationEnvelope {
    WorkspaceOperationEnvelope::v1(operation)
}

fn create_note(id: &str, parent: Option<&str>, markdown: &str) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::CreateNote {
        id: id.into(),
        title: format!("Title {id}"),
        placement: NodePlacement::last(parent.map(str::to_owned)),
        document_json: json!({"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": markdown}]}]}),
        markdown: markdown.into(),
        at: 1,
    })
}

fn create_folder(id: &str) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::CreateFolder {
        id: id.into(),
        title: format!("Folder {id}"),
        placement: NodePlacement::last(None),
        at: 1,
    })
}

fn set_locked(id: &str, locked: bool, at: i64) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::SetNodeLocked {
        id: id.into(),
        locked,
        at,
    })
}

fn save(
    note_id: &str,
    expected_revision: i64,
    markdown: &str,
    at: i64,
) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::SaveDocument {
        note_id: note_id.into(),
        document_json: json!({"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": markdown}]}]}),
        markdown: markdown.into(),
        word_count: markdown.split_whitespace().count() as i64,
        expected_revision,
        at,
    })
}

fn entropy(seed: u8) -> Vec<u8> {
    (0..NOTE_LOCK_CONFIGURE_ENTROPY_BYTES)
        .map(|index| seed.wrapping_add(index as u8))
        .collect()
}

fn pin_request(secret: &str) -> ConfigureNoteLockRequest {
    ConfigureNoteLockRequest {
        kind: NoteLockKind::Pin,
        secret: secret.into(),
        hint: Some("the usual".into()),
        entropy: entropy(7),
    }
}

fn document<'a>(
    snapshot: &'a skriuw_domain::WorkspaceSnapshot,
    note_id: &str,
) -> &'a skriuw_domain::WorkspaceDocument {
    snapshot
        .documents
        .iter()
        .find(|document| document.note_id == note_id)
        .expect("document present")
}

fn locked_at(snapshot: &skriuw_domain::WorkspaceSnapshot, id: &str) -> Option<i64> {
    snapshot
        .nodes
        .iter()
        .find(|node| node.id == id)
        .expect("node present")
        .locked_at
}

#[test]
fn locking_a_note_seals_its_body_and_scrubs_every_projection() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1", None, "secret plans for the launch"),
            create_note("note-2", None, "public agenda"),
        ])
        .expect("create notes");
    assert_eq!(storage.search("secret", 10).expect("search").len(), 1);

    let state = storage.note_lock_state(0).expect("state");
    assert!(!state.configured);

    let recovery_code = storage
        .configure_note_lock(pin_request("2468"), 10)
        .expect("configure");
    assert_eq!(recovery_code.len(), 39);
    let state = storage.note_lock_state(10).expect("state");
    assert!(state.configured && state.unlocked);
    assert_eq!(state.kind, Some(NoteLockKind::Pin));
    assert_eq!(state.hint.as_deref(), Some("the usual"));

    let ack = storage
        .apply_operations(&[set_locked("note-1", true, 20)])
        .expect("lock note");
    assert_eq!(
        ack.applied, 2,
        "the lock request expands into a sealed save plus the flag"
    );
    assert_eq!(ack.revisions.len(), 1);
    assert_eq!(ack.revisions[0].revision, 2);

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(locked_at(&snapshot, "note-1"), Some(20));
    let sealed = document(&snapshot, "note-1");
    assert!(sealed.sealed.is_some());
    assert_eq!(sealed.markdown, "");
    assert_eq!(sealed.word_count, 0);
    assert_eq!(sealed.document_json, json!({"type": "doc", "content": []}));
    assert!(document(&snapshot, "note-2").sealed.is_none());
    assert!(storage.search("secret", 10).expect("search").is_empty());
    assert_eq!(storage.search("agenda", 10).expect("search").len(), 1);
    assert_eq!(
        storage
            .note_lock_state(20)
            .expect("state")
            .locked_note_count,
        1
    );

    let opened = storage.read_locked_documents(None).expect("read locked");
    assert_eq!(opened.len(), 1);
    assert_eq!(opened[0].markdown, "secret plans for the launch");
    assert_eq!(opened[0].word_count, 5);
    assert_eq!(opened[0].revision, 2);
    assert!(opened[0].sealed.is_none());

    storage
        .apply_operations(&[save("note-1", 2, "revised secret plans", 30)])
        .expect("save while unlocked");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(document(&snapshot, "note-1").markdown, "");
    assert!(storage.search("revised", 10).expect("search").is_empty());
    let opened = storage
        .read_locked_documents(Some(&["note-1".to_owned()]))
        .expect("read locked");
    assert_eq!(opened[0].markdown, "revised secret plans");
    assert_eq!(opened[0].revision, 3);

    storage.relock_note_lock().expect("relock");
    assert!(!storage.note_lock_state(30).expect("state").unlocked);
    assert!(matches!(
        storage.read_locked_documents(None),
        Err(StorageError::InvalidOperation(_))
    ));
    assert!(matches!(
        storage.apply_operations(&[save("note-1", 3, "typed while locked", 40)]),
        Err(StorageError::InvalidOperation(_))
    ));
    assert!(matches!(
        storage.apply_operations(&[set_locked("note-2", true, 40)]),
        Err(StorageError::InvalidOperation(_))
    ));
}

#[test]
fn wrong_secrets_count_and_slow_down_and_the_right_one_resets() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .configure_note_lock(pin_request("2468"), 10)
        .expect("configure");
    storage.relock_note_lock().expect("relock");

    for attempt in 1..=2 {
        let error = storage
            .unlock_note_lock("0000", 100 + attempt)
            .expect_err("wrong pin");
        assert_eq!(error.to_string(), "invalid workspace operation: Wrong PIN.");
        let state = storage.note_lock_state(100 + attempt).expect("state");
        assert_eq!(state.failed_attempts, attempt as u32);
        assert_eq!(state.next_attempt_at, None);
    }
    let error = storage
        .unlock_note_lock("0000", 103)
        .expect_err("third wrong pin");
    assert!(
        error.to_string().contains("Try again in 30 seconds"),
        "{error}"
    );
    let state = storage.note_lock_state(104).expect("state");
    assert_eq!(state.failed_attempts, 3);
    assert_eq!(state.next_attempt_at, Some(103 + 30_000));

    let error = storage
        .unlock_note_lock("2468", 5_000)
        .expect_err("throttled");
    assert!(
        error
            .to_string()
            .starts_with("invalid workspace operation: Too many attempts"),
        "{error}"
    );
    assert!(!storage.note_lock_state(5_000).expect("state").unlocked);

    let state = storage
        .unlock_note_lock("2468", 40_000)
        .expect("unlock after the delay");
    assert!(state.unlocked);
    assert_eq!(state.failed_attempts, 0);
    assert_eq!(state.next_attempt_at, None);
}

#[test]
fn the_recovery_code_installs_a_new_secret_and_the_secret_can_change() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[create_note("note-1", None, "kept safe")])
        .expect("create");
    let recovery_code = storage
        .configure_note_lock(pin_request("2468"), 10)
        .expect("configure");
    storage
        .apply_operations(&[set_locked("note-1", true, 20)])
        .expect("lock");
    storage.relock_note_lock().expect("relock");

    assert!(matches!(
        storage.recover_note_lock(
            "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA",
            ReplaceNoteLockSecretRequest {
                kind: NoteLockKind::Passphrase,
                secret: "open sesame".into(),
                hint: None,
            },
            30,
        ),
        Err(StorageError::InvalidOperation(_))
    ));
    let state = storage
        .recover_note_lock(
            &recovery_code.to_lowercase(),
            ReplaceNoteLockSecretRequest {
                kind: NoteLockKind::Passphrase,
                secret: "open sesame".into(),
                hint: Some("  a story  ".into()),
            },
            30,
        )
        .expect("recover");
    assert!(state.unlocked);
    assert_eq!(state.kind, Some(NoteLockKind::Passphrase));
    assert_eq!(state.hint.as_deref(), Some("a story"));
    assert_eq!(
        storage.read_locked_documents(None).expect("read")[0].markdown,
        "kept safe"
    );

    storage.relock_note_lock().expect("relock");
    assert!(storage.unlock_note_lock("2468", 40).is_err());
    assert!(
        storage
            .unlock_note_lock("open sesame", 41)
            .expect("unlock")
            .unlocked
    );

    storage
        .change_note_lock_secret(
            ReplaceNoteLockSecretRequest {
                kind: NoteLockKind::Pin,
                secret: "1357".into(),
                hint: None,
            },
            50,
        )
        .expect("change");
    storage.relock_note_lock().expect("relock");
    assert!(storage.unlock_note_lock("open sesame", 60).is_err());
    assert!(
        storage
            .unlock_note_lock("1357", 61)
            .expect("unlock")
            .unlocked
    );
    assert!(
        storage
            .recover_note_lock(
                &recovery_code,
                ReplaceNoteLockSecretRequest {
                    kind: NoteLockKind::Pin,
                    secret: "9999".into(),
                    hint: None,
                },
                70,
            )
            .is_ok(),
        "the recovery code survives secret changes"
    );
}

#[test]
fn folder_locks_cover_descendants_and_new_or_moved_notes_inherit_them() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_folder("folder-1"),
            create_note("inside", Some("folder-1"), "inside body"),
            create_note("outside", None, "outside body"),
        ])
        .expect("create");
    storage
        .configure_note_lock(pin_request("2468"), 10)
        .expect("configure");
    storage
        .apply_operations(&[set_locked("folder-1", true, 20)])
        .expect("lock folder");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(locked_at(&snapshot, "folder-1"), Some(20));
    assert_eq!(locked_at(&snapshot, "inside"), Some(20));
    assert_eq!(locked_at(&snapshot, "outside"), None);
    assert!(document(&snapshot, "inside").sealed.is_some());

    storage
        .apply_operations(&[create_note("newborn", Some("folder-1"), "born locked")])
        .expect("create in locked folder");
    storage
        .apply_operations(&[op(WorkspaceOperation::MoveNode {
            id: "outside".into(),
            placement: NodePlacement::last(Some("folder-1".into())),
            at: 30,
        })])
        .expect("move into locked folder");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(locked_at(&snapshot, "newborn"), Some(1));
    assert!(document(&snapshot, "newborn").sealed.is_some());
    assert_eq!(locked_at(&snapshot, "outside"), Some(30));
    assert!(document(&snapshot, "outside").sealed.is_some());
    assert!(storage.search("body", 10).expect("search").is_empty());
    let mut opened = storage.read_locked_documents(None).expect("read");
    opened.sort_by(|left, right| left.note_id.cmp(&right.note_id));
    assert_eq!(
        opened
            .iter()
            .map(|doc| doc.markdown.as_str())
            .collect::<Vec<_>>(),
        ["inside body", "born locked", "outside body"]
    );

    storage
        .apply_operations(&[set_locked("folder-1", false, 40)])
        .expect("unlock folder");
    let snapshot = storage.bootstrap().expect("bootstrap");
    for id in ["folder-1", "inside", "newborn", "outside"] {
        assert_eq!(locked_at(&snapshot, id), None, "{id}");
    }
    assert!(document(&snapshot, "inside").sealed.is_none());
    assert_eq!(document(&snapshot, "outside").markdown, "outside body");
    assert_eq!(storage.search("body", 10).expect("search").len(), 2);
    assert_eq!(storage.search("born", 10).expect("search").len(), 1);
}

#[test]
fn removing_the_lock_restores_every_body_and_a_restart_starts_locked() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("workspace.sqlite");
    {
        let storage = SqliteWorkspace::open(&path).expect("open");
        storage
            .apply_operations(&[create_note("note-1", None, "persisted secret")])
            .expect("create");
        storage
            .configure_note_lock(pin_request("2468"), 10)
            .expect("configure");
        storage
            .apply_operations(&[set_locked("note-1", true, 20)])
            .expect("lock");
    }
    let reopened = SqliteWorkspace::open(&path).expect("reopen");
    let state = reopened.note_lock_state(30).expect("state");
    assert!(state.configured && !state.unlocked);
    let snapshot = reopened.bootstrap().expect("bootstrap");
    assert!(document(&snapshot, "note-1").sealed.is_some());
    assert!(reopened.search("persisted", 10).expect("search").is_empty());

    let archive = reopened.export_archive(40).expect("archive");
    assert!(archive.note_lock.is_some());
    assert!(archive.documents[0].sealed.is_some());
    assert_eq!(archive.documents[0].markdown, "");

    assert!(matches!(
        reopened.remove_note_lock(50),
        Err(StorageError::InvalidOperation(_))
    ));
    reopened.unlock_note_lock("2468", 50).expect("unlock");
    let ack = reopened.remove_note_lock(60).expect("remove");
    assert!(ack.applied >= 3);
    let state = reopened.note_lock_state(60).expect("state");
    assert!(!state.configured && !state.unlocked);
    assert_eq!(state.locked_note_count, 0);
    let snapshot = reopened.bootstrap().expect("bootstrap");
    assert!(document(&snapshot, "note-1").sealed.is_none());
    assert_eq!(document(&snapshot, "note-1").markdown, "persisted secret");
    assert_eq!(reopened.search("persisted", 10).expect("search").len(), 1);

    let imported = SqliteWorkspace::open_in_memory().expect("open");
    imported
        .replace_from_archive(&archive)
        .expect("import sealed archive");
    let snapshot = imported.bootstrap().expect("bootstrap");
    assert!(document(&snapshot, "note-1").sealed.is_some());
    assert!(imported.search("persisted", 10).expect("search").is_empty());
    assert!(imported.note_lock_state(70).expect("state").configured);
    imported
        .unlock_note_lock("2468", 70)
        .expect("unlock imported");
    assert_eq!(
        imported.read_locked_documents(None).expect("read")[0].markdown,
        "persisted secret"
    );
}

#[test]
fn a_second_lock_cannot_be_configured_and_the_database_file_holds_no_plaintext() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("workspace.sqlite");
    let storage = SqliteWorkspace::open(&path).expect("open");
    storage
        .apply_operations(&[create_note("note-1", None, "zebra quantum paperclip")])
        .expect("create");
    storage
        .configure_note_lock(pin_request("2468"), 10)
        .expect("configure");
    assert!(matches!(
        storage.configure_note_lock(pin_request("1111"), 11),
        Err(StorageError::AlreadyExists(_))
    ));
    storage
        .apply_operations(&[set_locked("note-1", true, 20)])
        .expect("lock");
    drop(storage);
    let needle = b"zebra quantum paperclip";
    for suffix in ["", "-wal", "-shm"] {
        let candidate = path.with_file_name(format!("workspace.sqlite{suffix}"));
        let Ok(bytes) = std::fs::read(&candidate) else {
            continue;
        };
        assert!(
            !bytes.windows(needle.len()).any(|window| window == needle),
            "the locked body must not appear in {}",
            candidate.display()
        );
    }
}
