use super::*;

#[test]
fn creates_verified_online_backup() {
    let directory = tempdir().expect("temporary directory");
    let backup_path = directory.path().join("workspace.backup.db");
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    storage.backup_to(&backup_path).expect("create backup");
    assert!(!PathBuf::from(format!("{}-wal", backup_path.display())).exists());
    assert!(!PathBuf::from(format!("{}-shm", backup_path.display())).exists());
    let backup = SqliteWorkspace::open(&backup_path).expect("open backup");

    assert_eq!(backup.bootstrap().expect("backup snapshot").nodes.len(), 1);
    assert_eq!(backup.quick_check().expect("backup check"), "ok");
}

#[test]
fn backups_and_restores_leave_the_sync_encryption_key_behind() {
    let directory = tempdir().expect("temporary directory");
    let backup_path = directory.path().join("workspace.backup.db");
    let restore_path = directory.path().join("restored.db");
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .connect_sync(&NewSyncConnection {
            workspace_id: "workspace-1".into(),
            device_id: "device-1".into(),
            connected_at: 1,
            observed_server_sequence: 0,
        })
        .expect("connect sync");
    let seal = skriuw_storage::WorkspaceSeal {
        workspace_id: "workspace-1".into(),
        key_id: "0f1e2d3c4b5a6978".into(),
        scheme: "argon2id-xchacha20poly1305-v2".into(),
        key_material: vec![7; 32].into(),
        enabled_at: 1,
        sealed_checkpoint_at: None,
        encrypted_from_server_sequence: 0,
    };
    storage.set_workspace_seal(&seal).expect("store seal");

    storage.backup_to(&backup_path).expect("create backup");
    let backup = SqliteWorkspace::open(&backup_path).expect("open backup");
    assert_eq!(backup.workspace_seal().expect("read backup seal"), None);
    assert!(backup.sync_connection().expect("read connection").is_some());

    backup
        .set_workspace_seal(&seal)
        .expect("simulate an artifact that still carries a key");
    drop(backup);
    SqliteWorkspace::restore_backup_to(&backup_path, &restore_path).expect("restore backup");
    let restored = SqliteWorkspace::open(&restore_path).expect("open restored database");
    assert_eq!(restored.workspace_seal().expect("read restored seal"), None);
    assert_eq!(
        storage.workspace_seal().expect("read live seal"),
        Some(seal)
    );
}

#[test]
fn backup_refuses_existing_target() {
    let directory = tempdir().expect("temporary directory");
    let backup_path = directory.path().join("workspace.backup.db");
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage.backup_to(&backup_path).expect("create backup");

    let error = storage
        .backup_to(&backup_path)
        .expect_err("existing backup target");

    assert!(matches!(error, StorageError::AlreadyExists(_)));
}

#[test]
fn restores_verified_backup_to_new_database() {
    let directory = tempdir().expect("temporary directory");
    let backup_path = directory.path().join("workspace.backup.db");
    let restore_path = directory.path().join("restored.db");
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    storage.backup_to(&backup_path).expect("create backup");

    SqliteWorkspace::restore_backup_to(&backup_path, &restore_path).expect("restore backup");
    let restored = SqliteWorkspace::open(&restore_path).expect("open restored database");

    assert_eq!(
        restored.bootstrap().expect("restored snapshot").nodes[0].id,
        "note-1"
    );
}

#[test]
fn rejects_corrupt_backup_without_creating_target() {
    let directory = tempdir().expect("temporary directory");
    let backup_path = directory.path().join("corrupt.db");
    let restore_path = directory.path().join("restored.db");
    std::fs::write(&backup_path, b"not a SQLite database").expect("write corrupt backup");

    SqliteWorkspace::restore_backup_to(&backup_path, &restore_path)
        .expect_err("reject corrupt backup");

    assert!(!restore_path.exists());
}
