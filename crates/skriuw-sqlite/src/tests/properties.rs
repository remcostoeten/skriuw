use super::*;

#[test]
fn typed_properties_and_templates_round_trip_in_order() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    let status = NoteProperty {
        note_id: "note-1".into(),
        field: NotePropertyField {
            id: "status".into(),
            name: "Status".into(),
            value: VersionedNotePropertyValue::v1(NotePropertyValue::Select(Some("active".into()))),
            options: vec![NotePropertyOption {
                id: "active".into(),
                label: "Active".into(),
                color: NotePropertyColor::Amber,
            }],
            position: 1,
        },
    };
    let template = NotePropertyTemplate {
        id: "project".into(),
        name: "Project".into(),
        position: 0,
        properties: vec![NotePropertyField {
            id: "owner".into(),
            name: "Owner".into(),
            value: VersionedNotePropertyValue::v1(NotePropertyValue::Person(vec![
                "person-1".into(),
            ])),
            options: Vec::new(),
            position: 0,
        }],
    };
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::CreatePerson {
                person: WorkspacePerson {
                    id: "person-1".into(),
                    name: "Alice".into(),
                    initials: Some("A".into()),
                    color: None,
                    note: None,
                    created_at: 1,
                    updated_at: 1,
                    created_in: None,
                },
            }),
            op(WorkspaceOperation::SetNoteProperty {
                property: text_property("note-1", "summary", 0),
                at: 2,
            }),
            op(WorkspaceOperation::SetNoteProperty {
                property: status,
                at: 3,
            }),
            op(WorkspaceOperation::ReorderNoteProperties {
                note_id: "note-1".into(),
                ordered_property_ids: vec!["status".into(), "summary".into()],
                at: 4,
            }),
            op(WorkspaceOperation::SetNotePropertyTemplate { template }),
            op(WorkspaceOperation::SetNotePropertyTemplate {
                template: NotePropertyTemplate {
                    id: "blank".into(),
                    name: "Blank".into(),
                    position: 1,
                    properties: Vec::new(),
                },
            }),
            op(WorkspaceOperation::ReorderNotePropertyTemplates {
                ordered_template_ids: vec!["blank".into(), "project".into()],
            }),
            op(WorkspaceOperation::DeleteNotePropertyTemplate {
                template_id: "blank".into(),
            }),
        ])
        .expect("write properties");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(
        snapshot
            .properties
            .iter()
            .map(|property| property.field.id.as_str())
            .collect::<Vec<_>>(),
        vec!["status", "summary"]
    );
    assert_eq!(snapshot.property_templates[0].properties[0].id, "owner");
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::DeletePerson {
            id: "person-1".into(),
        })]),
        Err(StorageError::InvalidOperation(_))
    ));

    let archive = storage.export_archive(5).expect("export");
    let restored = SqliteWorkspace::open_in_memory().expect("open restored");
    restored
        .replace_from_archive(&archive)
        .expect("import properties");
    let restored_snapshot = restored.bootstrap().expect("bootstrap restored");
    assert_eq!(restored_snapshot.properties, snapshot.properties);
    assert_eq!(
        restored_snapshot.property_templates,
        snapshot.property_templates
    );
}

#[test]
fn property_failures_are_atomic_and_references_are_enforced() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let mut wrong_position = text_property("note-1", "late", 1);
    let missing_person = NoteProperty {
        note_id: "note-1".into(),
        field: NotePropertyField {
            id: "owner".into(),
            name: "Owner".into(),
            value: VersionedNotePropertyValue::v1(NotePropertyValue::Person(vec![
                "missing".into(),
            ])),
            options: Vec::new(),
            position: 0,
        },
    };
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::SetNoteProperty {
            property: missing_person,
            at: 2,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::SetNoteProperty {
            property: wrong_position.clone(),
            at: 2,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));

    wrong_position.field.position = 0;
    let result = storage.apply_operations(&[
        op(WorkspaceOperation::SetNoteProperty {
            property: wrong_position,
            at: 2,
        }),
        op(WorkspaceOperation::ReorderNoteProperties {
            note_id: "note-1".into(),
            ordered_property_ids: vec!["missing".into()],
            at: 3,
        }),
    ]);
    assert!(matches!(result, Err(StorageError::InvalidOperation(_))));
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap")
            .properties
            .is_empty()
    );
}

#[test]
fn bootstrap_rejects_semantically_corrupt_property_values() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::SetNoteProperty {
                property: text_property("note-1", "summary", 0),
                at: 2,
            }),
        ])
        .expect("seed property");
    storage
        .lock()
        .expect("database lock")
        .execute(
            "UPDATE note_properties SET value_json = ?1 WHERE note_id = 'note-1'",
            [r#"{"valueVersion":2,"type":"text","value":"future"}"#],
        )
        .expect("corrupt property");

    assert!(matches!(storage.bootstrap(), Err(StorageError::Backend(_))));
}

#[test]
fn property_remove_compacts_and_purge_cascades() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::SetNoteProperty {
                property: text_property("note-1", "first", 0),
                at: 2,
            }),
            op(WorkspaceOperation::SetNoteProperty {
                property: text_property("note-1", "second", 1),
                at: 3,
            }),
            op(WorkspaceOperation::RemoveNoteProperty {
                note_id: "note-1".into(),
                property_id: "first".into(),
                at: 4,
            }),
            op(WorkspaceOperation::TrashSubtree {
                root_id: "note-1".into(),
                at: 5,
            }),
        ])
        .expect("trash property note");

    let snapshot = storage.bootstrap().expect("bootstrap trashed");
    assert_eq!(snapshot.properties.len(), 1);
    assert_eq!(snapshot.properties[0].field.position, 0);

    storage
        .apply_operations(&[op(WorkspaceOperation::PurgeSubtree {
            root_id: "note-1".into(),
            trashed_before: 5,
        })])
        .expect("purge");
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap purged")
            .properties
            .is_empty()
    );
}

#[test]
fn provider_import_receipts_commit_replace_and_cascade_atomically() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    let receipt = |note_id: &str, imported_at: i64| {
        op(WorkspaceOperation::RecordProviderImport {
            receipt: ProviderImportReceipt {
                provider: "obsidian".into(),
                source_key: "source-key".into(),
                source_path: "Folder/Note.md".into(),
                note_id: note_id.into(),
                imported_at,
                opened_file: None,
            },
        })
    };
    storage
        .apply_operations(&[create_note("note-1"), receipt("note-1", 2)])
        .expect("record receipt");
    let snapshot = storage.bootstrap().expect("bootstrap receipt");
    assert_eq!(snapshot.import_receipts.len(), 1);
    assert_eq!(snapshot.import_receipts[0].note_id, "note-1");

    let failed = storage.apply_operations(&[
        receipt("missing-note", 3),
        op(WorkspaceOperation::CreateTag {
            tag: skriuw_domain::WorkspaceTag {
                id: "tag-rollback".into(),
                name: "rollback".into(),
                color: None,
                created_at: 3,
                updated_at: 3,
                created_in: None,
            },
        }),
    ]);
    assert!(failed.is_err());
    let snapshot = storage.bootstrap().expect("bootstrap rollback");
    assert_eq!(snapshot.import_receipts[0].note_id, "note-1");
    assert!(snapshot.tags.is_empty());

    storage
        .apply_operations(&[
            op(WorkspaceOperation::TrashSubtree {
                root_id: "note-1".into(),
                at: 4,
            }),
            op(WorkspaceOperation::PurgeSubtree {
                root_id: "note-1".into(),
                trashed_before: 4,
            }),
        ])
        .expect("purge imported note");
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap purge")
            .import_receipts
            .is_empty()
    );
}

#[test]
fn provider_import_receipts_keep_and_replace_opened_file_state() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    let receipt = |opened_file: Option<OpenedFileState>| {
        op(WorkspaceOperation::RecordProviderImport {
            receipt: ProviderImportReceipt {
                provider: "opened-file".into(),
                source_key: "source-key".into(),
                source_path: "/home/me/todo.md".into(),
                note_id: "note-1".into(),
                imported_at: 2,
                opened_file,
            },
        })
    };
    let state = |file_hash: &str| OpenedFileState {
        format_id: "markdown".into(),
        file_hash: file_hash.into(),
        note_hash: "note-hash".into(),
    };
    storage
        .apply_operations(&[create_note("note-1"), receipt(Some(state("first")))])
        .expect("record opened file");
    assert_eq!(
        storage.bootstrap().expect("bootstrap").import_receipts[0].opened_file,
        Some(state("first"))
    );

    storage
        .apply_operations(&[receipt(Some(state("second")))])
        .expect("replace opened file");
    assert_eq!(
        storage.bootstrap().expect("bootstrap").import_receipts[0].opened_file,
        Some(state("second"))
    );

    storage
        .apply_operations(&[receipt(None)])
        .expect("clear opened file");
    assert_eq!(
        storage.bootstrap().expect("bootstrap").import_receipts[0].opened_file,
        None
    );
}
