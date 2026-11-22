use super::*;

fn board(updated_at: i64) -> serde_json::Value {
    json!({ "layout": "board", "groupBy": "p:status", "updatedAt": updated_at })
}

fn set_view(folder_id: Option<&str>, view: Option<serde_json::Value>) -> WorkspaceOperation {
    WorkspaceOperation::SetDatabaseView {
        folder_id: folder_id.map(str::to_owned),
        view,
    }
}

fn stored_views(storage: &SqliteWorkspace) -> serde_json::Value {
    storage
        .bootstrap()
        .expect("bootstrap")
        .settings
        .extensions
        .get("databaseViews")
        .cloned()
        .unwrap_or(serde_json::Value::Null)
}

fn queued_types(storage: &SqliteWorkspace, now: i64) -> Vec<&'static str> {
    storage
        .claim_sync_operations("views", now, 50, 64)
        .expect("claim")
        .map(|batch| {
            batch
                .request
                .operations
                .iter()
                .map(|operation| {
                    envelope_of(operation)
                        .operation
                        .sync_policy()
                        .operation_type
                })
                .collect()
        })
        .unwrap_or_default()
}

fn write_legacy_layouts(path: &std::path::Path, views: serde_json::Value) {
    let connection = Connection::open(path).expect("raw open");
    let raw: String = connection
        .query_row(
            "SELECT value_json FROM app_state WHERE key = 'settings'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| serde_json::to_string(&WorkspaceSettings::default()).expect("encode"));
    let mut settings: WorkspaceSettings = serde_json::from_str(&raw).expect("decode");
    settings.extensions.insert("databaseViews".into(), views);
    connection
        .execute(
            "INSERT INTO app_state(key, value_json) VALUES ('settings', ?1) \
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            [serde_json::to_string(&settings).expect("encode")],
        )
        .expect("write legacy layouts");
    connection
        .execute(
            "DELETE FROM app_state WHERE key = 'database_views_replicated'",
            [],
        )
        .expect("forget the replication marker");
}

#[test]
fn layouts_replicate_and_survive_device_local_settings_updates() {
    let storage = connected_fresh();
    storage
        .apply_operations(&[folder("projects", "Projects", 1)])
        .expect("folder");
    push_all(&storage, 1);
    storage
        .apply_operations(&[
            op(set_view(Some("projects"), Some(board(5)))),
            op(set_view(None, Some(board(6)))),
            op(WorkspaceOperation::UpdateSettings {
                settings: custom_settings(),
            }),
        ])
        .expect("save layouts");
    let views = stored_views(&storage);
    assert_eq!(views["version"], json!(1));
    assert_eq!(views["views"]["projects"], board(5));
    assert_eq!(views["views"]["@workspace"], board(6));
    assert_eq!(
        storage.bootstrap().expect("bootstrap").settings.theme,
        "paper"
    );
    assert_eq!(
        queued_types(&storage, 100),
        ["set_database_view", "set_database_view"]
    );
}

#[test]
fn clearing_a_layout_and_a_layout_for_a_missing_folder_keep_only_live_scopes() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            folder("projects", "Projects", 1),
            op(set_view(Some("projects"), Some(board(5)))),
            op(set_view(Some("missing"), Some(board(6)))),
        ])
        .expect("save layouts");
    assert_eq!(
        stored_views(&storage)["views"],
        json!({ "projects": board(5) })
    );
    storage
        .apply_operations(&[op(set_view(Some("projects"), None))])
        .expect("clear layout");
    assert_eq!(stored_views(&storage)["views"], json!({}));
}

#[test]
fn a_remote_layout_applies_once_and_is_not_queued_again() {
    let storage = connected_fresh();
    storage
        .apply_operations(&[folder("projects", "Projects", 1)])
        .expect("folder");
    push_all(&storage, 1);
    let incoming = remote(
        "views-1",
        "other-device",
        1,
        2,
        set_view(Some("projects"), Some(board(9))),
    );
    let outcomes = storage
        .apply_remote_operations(std::slice::from_ref(&incoming), 2)
        .expect("remote layout");
    assert!(matches!(outcomes[..], [RemoteSyncApplyOutcome::Applied(_)]));
    assert_eq!(stored_views(&storage)["views"]["projects"], board(9));
    assert!(queued_types(&storage, 100).is_empty());

    let repeat = remote(
        "views-2",
        "third-device",
        1,
        3,
        set_view(Some("projects"), Some(board(9))),
    );
    let outcomes = storage
        .apply_remote_operations(&[repeat], 3)
        .expect("equivalent layout");
    assert!(!matches!(
        outcomes[..],
        [RemoteSyncApplyOutcome::Applied(_)]
    ));
}

#[test]
fn a_first_connection_replays_saved_layouts() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            folder("projects", "Projects", 1),
            op(set_view(Some("projects"), Some(board(5)))),
        ])
        .expect("save layout");
    connect_at_cursor(&storage, 0);
    let batch = storage
        .claim_sync_operations("views", 100, 50, 64)
        .expect("claim")
        .expect("initial sync");
    assert!(batch.request.operations.iter().any(|operation| matches!(
        &envelope_of(operation).operation,
        WorkspaceOperation::SetDatabaseView { folder_id: Some(id), view: Some(view) }
            if id == "projects" && view == &board(5)
    )));
}

#[test]
fn layouts_saved_before_they_replicated_queue_once_on_a_connected_device() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("legacy-layouts.db");
    {
        let storage = SqliteWorkspace::open(&path).expect("open");
        storage
            .apply_operations(&[folder("projects", "Projects", 1)])
            .expect("folder");
        connect_at_cursor(&storage, 0);
        push_all(&storage, 1);
    }
    write_legacy_layouts(
        &path,
        json!({ "version": 1, "views": { "projects": board(5), "@workspace": board(4) } }),
    );
    {
        let storage = SqliteWorkspace::open(&path).expect("upgrade");
        assert_eq!(
            queued_types(&storage, 100),
            ["set_database_view", "set_database_view"]
        );
        push_all(&storage, 10);
    }
    let storage = SqliteWorkspace::open(&path).expect("restart");
    assert!(queued_types(&storage, 200).is_empty());
}

#[test]
fn a_disconnected_device_queues_its_saved_layouts_when_it_reconnects() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("disconnected-layouts.db");
    {
        let storage = SqliteWorkspace::open(&path).expect("open");
        storage
            .apply_operations(&[folder("projects", "Projects", 1)])
            .expect("folder");
        connect_at_cursor(&storage, 0);
        push_all(&storage, 1);
        storage.disconnect_sync(20).expect("disconnect");
    }
    write_legacy_layouts(
        &path,
        json!({ "version": 1, "views": { "projects": board(5) } }),
    );
    let storage = SqliteWorkspace::open(&path).expect("upgrade while disconnected");
    connect_at_cursor(&storage, 1);
    assert_eq!(queued_types(&storage, 100), ["set_database_view"]);
}

#[test]
fn a_layout_change_rolls_back_with_a_failed_batch() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[folder("projects", "Projects", 1)])
        .expect("folder");
    storage
        .apply_operations(&[
            op(set_view(Some("projects"), Some(board(5)))),
            op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Missing".into(),
                at: 1,
            }),
        ])
        .expect_err("atomic rollback");
    assert_eq!(stored_views(&storage), serde_json::Value::Null);
}
