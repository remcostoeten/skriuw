use super::*;

#[test]
fn persists_normalized_settings_document_and_defaults() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    assert_eq!(
        storage.bootstrap().expect("bootstrap defaults").settings,
        WorkspaceSettings::default()
    );

    let settings = custom_settings();
    storage
        .apply_operations(&[op(WorkspaceOperation::UpdateSettings {
            settings: settings.clone(),
        })])
        .expect("update settings");
    assert_eq!(storage.bootstrap().expect("bootstrap").settings, settings);

    let unsupported = WorkspaceSettings {
        settings_version: 2,
        ..WorkspaceSettings::default()
    };
    storage
        .apply_operations(&[op(WorkspaceOperation::UpdateSettings {
            settings: unsupported,
        })])
        .expect_err("reject unsupported settings version");
    assert_eq!(
        storage
            .bootstrap()
            .expect("bootstrap after rejection")
            .settings,
        settings
    );
}

#[test]
fn settings_update_rolls_back_with_failed_batch() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            op(WorkspaceOperation::UpdateSettings {
                settings: custom_settings(),
            }),
            op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Nope".into(),
                at: 1,
            }),
        ])
        .expect_err("failed batch");

    assert_eq!(
        storage.bootstrap().expect("bootstrap").settings,
        WorkspaceSettings::default()
    );
}

#[test]
fn personal_preferences_survive_restart_and_archive_and_reject_invalid_updates() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("personal-preferences.db");
    let archive = {
        let storage = SqliteWorkspace::open(&path).expect("open");
        storage
            .apply_operations(&[create_note("template-source")])
            .expect("source");
        let mut settings = storage.bootstrap().expect("bootstrap").settings;
        settings.extensions.insert(
            "noteTemplateIds".into(),
            serde_json::json!(["template-source"]),
        );
        settings.extensions.insert(
            "savedSearches".into(),
            serde_json::json!(["#design planning"]),
        );
        storage
            .apply_operations(&[op(WorkspaceOperation::UpdateSettings {
                settings: settings.clone(),
            })])
            .expect("save preferences");
        settings
            .extensions
            .insert("savedSearches".into(), serde_json::json!([42]));
        assert!(
            storage
                .apply_operations(&[op(WorkspaceOperation::UpdateSettings { settings })])
                .is_err()
        );
        storage.export_archive(50).expect("export")
    };
    let reopened = SqliteWorkspace::open(&path).expect("reopen");
    assert_eq!(
        reopened.bootstrap().expect("bootstrap").settings,
        archive.settings
    );
    let imported = SqliteWorkspace::open_in_memory().expect("import target");
    imported.replace_from_archive(&archive).expect("import");
    assert_eq!(
        imported.bootstrap().expect("bootstrap").settings,
        archive.settings
    );
}

#[test]
fn math_macros_persist_and_survive_device_local_settings_updates() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("math-macros.db");
    let macros = std::collections::BTreeMap::from([("\\R".into(), "\\mathbb{R}".into())]);
    {
        let storage = SqliteWorkspace::open(&path).expect("open");
        storage
            .apply_operations(&[op(WorkspaceOperation::SetMathMacros {
                macros: macros.clone(),
            })])
            .expect("save macros");
        storage
            .apply_operations(&[op(WorkspaceOperation::UpdateSettings {
                settings: custom_settings(),
            })])
            .expect("change appearance");
    }
    let storage = SqliteWorkspace::open(&path).expect("restart");
    let settings = storage.bootstrap().expect("bootstrap").settings;
    assert_eq!(settings.theme, "paper");
    assert_eq!(settings.extensions["mathMacros"], json!(macros));
    connect_at_cursor(&storage, 0);
    let batch = storage
        .claim_sync_operations("macros", 100, 50, 64)
        .expect("claim")
        .expect("initial sync");
    assert!(batch.request.operations.iter().any(|operation| matches!(&envelope_of(operation).operation, WorkspaceOperation::SetMathMacros { macros: value } if value == &macros)));
}

#[test]
fn math_macros_replicate_without_device_preferences_or_remote_reenqueue() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[op(WorkspaceOperation::UpdateSettings {
            settings: custom_settings(),
        })])
        .expect("local preferences");
    connect_at_cursor(&storage, 0);
    let macros = std::collections::BTreeMap::from([("\\R".into(), "\\mathbb{R}".into())]);
    let incoming = remote(
        "macros-1",
        "other-device",
        1,
        1,
        WorkspaceOperation::SetMathMacros {
            macros: macros.clone(),
        },
    );
    storage
        .apply_remote_operations(&[incoming], 1)
        .expect("remote macros");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.settings.theme, "paper");
    assert_eq!(snapshot.settings.extensions["mathMacros"], json!(macros));
    assert!(
        storage
            .claim_sync_operations("macros", 100, 50, 64)
            .expect("claim")
            .is_none()
    );
    storage
        .apply_operations(&[op(WorkspaceOperation::SetMathMacros {
            macros: Default::default(),
        })])
        .expect("clear locally");
    let batch = storage
        .claim_sync_operations("macros", 101, 50, 64)
        .expect("claim")
        .expect("queued clear");
    assert_eq!(batch.request.operations.len(), 1);
    assert_eq!(
        envelope_of(&batch.request.operations[0])
            .operation
            .sync_policy()
            .operation_type,
        "set_math_macros"
    );
}

#[test]
fn math_macro_changes_roll_back_with_a_failed_batch_and_validate_imported_settings() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    let macros = std::collections::BTreeMap::from([("\\R".into(), "\\mathbb{R}".into())]);
    storage
        .apply_operations(&[
            op(WorkspaceOperation::SetMathMacros { macros }),
            op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Missing".into(),
                at: 1,
            }),
        ])
        .expect_err("atomic rollback");
    assert!(
        !storage
            .bootstrap()
            .expect("bootstrap")
            .settings
            .extensions
            .contains_key("mathMacros")
    );
    for value in [
        json!({"R":"x"}),
        json!({"\\R":5}),
        json!({"\\R":"x".repeat(4097)}),
    ] {
        let mut settings = WorkspaceSettings::default();
        settings.extensions.insert("mathMacros".into(), value);
        assert!(settings.validate().is_err());
    }
}
