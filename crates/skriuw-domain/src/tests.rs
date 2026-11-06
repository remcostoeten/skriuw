use std::collections::BTreeMap;

use serde_json::json;

use super::{
    ArchiveValidationError, MAX_DATABASE_VIEWS_BYTES, NodeKind, NoteProperty, NotePropertyColor,
    NotePropertyField, NotePropertyOption, NotePropertyTemplate, NotePropertyValue,
    OperationValidationError, SETTINGS_FIELDS, VersionedNotePropertyValue,
    WORKSPACE_ARCHIVE_VERSION, WORKSPACE_PROTOCOL_VERSION, WORKSPACE_SETTINGS_VERSION,
    WorkspaceArchive, WorkspaceDocument, WorkspaceNode, WorkspaceOperation,
    WorkspaceOperationEnvelope, WorkspaceSettings, WorkspaceTag,
};

#[test]
fn document_references_lists_each_target_once() {
    let document = serde_json::json!({
        "type": "doc",
        "content": [
            { "type": "paragraph", "content": [
                { "type": "mention_ref", "attrs": { "kind": "note", "id": "writing" } },
                { "type": "tag_ref", "attrs": { "id": "idea" } },
                { "type": "mention_ref", "attrs": { "kind": "note", "id": "writing" } }
            ] },
            { "type": "paragraph", "content": [
                { "type": "mention_ref", "attrs": { "kind": "note", "id": "linking" } },
                { "type": "tag_ref", "attrs": { "id": "idea" } }
            ] }
        ]
    });
    assert_eq!(
        super::document_references(&document),
        vec![
            super::DocumentReference {
                kind: super::ReferenceKind::Note,
                target_id: "writing".into()
            },
            super::DocumentReference {
                kind: super::ReferenceKind::Tag,
                target_id: "idea".into()
            },
            super::DocumentReference {
                kind: super::ReferenceKind::Note,
                target_id: "linking".into()
            },
        ]
    );
}

#[test]
fn typed_property_wire_format_and_validation_are_stable() {
    let property = NoteProperty {
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
            position: 0,
        },
    };
    let envelope =
        WorkspaceOperationEnvelope::v1(WorkspaceOperation::SetNoteProperty { property, at: 9 });
    envelope.validate().expect("valid property");
    let value = serde_json::to_value(envelope).expect("serialize property");
    assert_eq!(value["operation"]["property"]["id"], "status");
    assert_eq!(value["operation"]["property"]["value"]["valueVersion"], 1);
    assert_eq!(value["operation"]["property"]["value"]["type"], "select");

    let invalid = NotePropertyTemplate {
        id: "project".into(),
        name: "Project".into(),
        position: 0,
        properties: vec![NotePropertyField {
            id: "rating".into(),
            name: "Rating".into(),
            value: VersionedNotePropertyValue::v1(NotePropertyValue::Rating(Some(6))),
            options: Vec::new(),
            position: 0,
        }],
    };
    assert!(matches!(
        invalid.validate(),
        Err(OperationValidationError::InvalidIdentifier {
            field: "property rating"
        })
    ));
}

#[test]
fn validates_portable_archive_graph() {
    let archive = WorkspaceArchive {
        archive_version: WORKSPACE_ARCHIVE_VERSION,
        protocol_version: WORKSPACE_PROTOCOL_VERSION,
        exported_at: 10,
        active_note_id: Some("note-1".into()),
        nodes: vec![
            WorkspaceNode {
                id: "folder-1".into(),
                kind: NodeKind::Folder,
                parent_id: None,
                rank: 1024,
                title: "Folder".into(),
                icon: None,
                cover_image_id: None,
                cover_gradient: None,
                cover_full_width: false,
                cover_position_x: 50.0,
                cover_position_y: 50.0,
                cover_zoom: 1.0,
                created_at: 1,
                updated_at: 1,
                deleted_at: None,
                pinned_at: None,
                locked_at: None,
            },
            WorkspaceNode {
                id: "note-1".into(),
                kind: NodeKind::Note,
                parent_id: Some("folder-1".into()),
                rank: 1024,
                title: "Note".into(),
                icon: None,
                cover_image_id: None,
                cover_gradient: None,
                cover_full_width: false,
                cover_position_x: 50.0,
                cover_position_y: 50.0,
                cover_zoom: 1.0,
                created_at: 2,
                updated_at: 2,
                deleted_at: None,
                pinned_at: None,
                locked_at: None,
            },
        ],
        documents: vec![WorkspaceDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc"}),
            markdown: "# Note".into(),
            revision: 1,
            word_count: 1,
            sealed: None,
        }],
        settings: WorkspaceSettings::default(),
        tags: Vec::new(),
        people: Vec::new(),
        properties: Vec::new(),
        property_templates: Vec::new(),
        tasks: Vec::new(),
        prompts: Vec::new(),
        annotations: Vec::new(),
        note_lock: None,
    };

    archive.validate().expect("valid archive");
}

#[test]
fn rejects_archive_parent_cycle() {
    let mut archive = WorkspaceArchive {
        archive_version: WORKSPACE_ARCHIVE_VERSION,
        protocol_version: WORKSPACE_PROTOCOL_VERSION,
        exported_at: 10,
        active_note_id: None,
        nodes: vec![
            WorkspaceNode {
                id: "folder-1".into(),
                kind: NodeKind::Folder,
                parent_id: Some("folder-2".into()),
                rank: 1024,
                title: "One".into(),
                icon: None,
                cover_image_id: None,
                cover_gradient: None,
                cover_full_width: false,
                cover_position_x: 50.0,
                cover_position_y: 50.0,
                cover_zoom: 1.0,
                created_at: 1,
                updated_at: 1,
                deleted_at: None,
                pinned_at: None,
                locked_at: None,
            },
            WorkspaceNode {
                id: "folder-2".into(),
                kind: NodeKind::Folder,
                parent_id: Some("folder-1".into()),
                rank: 1024,
                title: "Two".into(),
                icon: None,
                cover_image_id: None,
                cover_gradient: None,
                cover_full_width: false,
                cover_position_x: 50.0,
                cover_position_y: 50.0,
                cover_zoom: 1.0,
                created_at: 1,
                updated_at: 1,
                deleted_at: None,
                pinned_at: None,
                locked_at: None,
            },
        ],
        documents: Vec::new(),
        settings: WorkspaceSettings::default(),
        tags: Vec::new(),
        people: Vec::new(),
        properties: Vec::new(),
        property_templates: Vec::new(),
        tasks: Vec::new(),
        prompts: Vec::new(),
        annotations: Vec::new(),
        note_lock: None,
    };

    assert!(matches!(
        archive.validate(),
        Err(ArchiveValidationError::Invalid(_))
    ));
    archive.nodes[1].parent_id = None;
    archive.validate().expect("repaired archive");
}

#[test]
fn settings_wire_format_is_stable() {
    let envelope = WorkspaceOperationEnvelope::v1(WorkspaceOperation::UpdateSettings {
        settings: WorkspaceSettings::default(),
    });

    let value = serde_json::to_value(envelope).expect("serialize settings operation");
    assert_eq!(value["operation"]["type"], "update_settings");
    assert_eq!(
        value["operation"]["settings"]["settingsVersion"],
        WORKSPACE_SETTINGS_VERSION
    );
    assert_eq!(value["operation"]["settings"]["theme"], "midnight");

    let keys = value["operation"]["settings"]
        .as_object()
        .expect("settings object")
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    let mut expected = SETTINGS_FIELDS.map(String::from).to_vec();
    expected.sort();
    let mut sorted = keys.clone();
    sorted.sort();
    assert_eq!(sorted, expected);
}

#[test]
fn settings_default_from_empty_document() {
    let settings = serde_json::from_value::<WorkspaceSettings>(json!({})).expect("empty document");

    assert_eq!(settings, WorkspaceSettings::default());
    settings.validate().expect("default settings");
    assert_eq!(settings.settings_version, WORKSPACE_SETTINGS_VERSION);
    assert!(settings.remember_last_note);
    assert_eq!(settings.editor_line_height, "comfortable");
}

#[test]
fn settings_fill_missing_fields_with_defaults() {
    let settings = serde_json::from_value::<WorkspaceSettings>(json!({
        "theme": "paper",
        "compactSidebar": true
    }))
    .expect("partial document");

    settings.validate().expect("partial settings");
    assert_eq!(settings.theme, "paper");
    assert!(settings.compact_sidebar);
    assert_eq!(settings.editor_font, "inter");
    assert_eq!(settings.editor_placeholder, "Start writing...");
}

#[test]
fn settings_preserve_unknown_fields_losslessly() {
    let document = json!({
        "theme": "paper",
        "futureFlag": true,
        "futureSection": {"nested": 3}
    });

    let settings =
        serde_json::from_value::<WorkspaceSettings>(document).expect("extended document");
    settings.validate().expect("extended settings");
    assert_eq!(settings.extensions["futureFlag"], json!(true));
    assert_eq!(settings.extensions["futureSection"], json!({"nested": 3}));

    let round_trip = serde_json::to_value(&settings).expect("serialize settings");
    assert_eq!(round_trip["futureFlag"], json!(true));
    assert_eq!(round_trip["futureSection"], json!({"nested": 3}));
    assert_eq!(
        serde_json::from_value::<WorkspaceSettings>(round_trip).expect("reparse settings"),
        settings
    );
}

#[test]
fn settings_written_with_the_retired_reduce_motion_field_still_load() {
    let settings = serde_json::from_value::<WorkspaceSettings>(json!({
        "theme": "paper",
        "reduceMotion": true
    }))
    .expect("legacy document");
    settings.validate().expect("legacy settings");
    assert_eq!(settings.extensions["reduceMotion"], json!(true));
}

#[test]
fn settings_reject_unsupported_versions_and_invalid_fields() {
    let future = serde_json::from_value::<WorkspaceSettings>(json!({"settingsVersion": 2}))
        .expect("future document");
    assert_eq!(
        future.validate(),
        Err(OperationValidationError::UnsupportedSettingsVersion(2))
    );

    let invalid_theme = WorkspaceSettings {
        theme: "../theme".into(),
        ..WorkspaceSettings::default()
    };
    assert!(matches!(
        invalid_theme.validate(),
        Err(OperationValidationError::InvalidIdentifier { .. })
    ));

    let oversized = WorkspaceSettings {
        editor_placeholder: "x".repeat(513),
        ..WorkspaceSettings::default()
    };
    assert!(matches!(
        oversized.validate(),
        Err(OperationValidationError::TooLong { .. })
    ));

    let collision = WorkspaceSettings {
        extensions: BTreeMap::from([("theme".to_string(), json!("paper"))]),
        ..WorkspaceSettings::default()
    };
    assert_eq!(
        collision.validate(),
        Err(OperationValidationError::SettingFieldCollision {
            key: "theme".into()
        })
    );

    let empty_key = WorkspaceSettings {
        extensions: BTreeMap::from([(" ".to_string(), json!(true))]),
        ..WorkspaceSettings::default()
    };
    assert!(matches!(
        empty_key.validate(),
        Err(OperationValidationError::Empty { .. })
    ));
}

#[test]
fn database_layouts_must_be_an_object_within_the_size_cap() {
    let with_views = |value: serde_json::Value| WorkspaceSettings {
        extensions: BTreeMap::from([("databaseViews".to_string(), value)]),
        ..WorkspaceSettings::default()
    };
    let saved = json!({
        "version": 1,
        "views": {
            "@workspace": {
                "layout": "board",
                "subfolders": true,
                "order": [],
                "hidden": ["created"],
                "sorts": [],
                "filters": [],
                "groupBy": "p:status",
                "updatedAt": 1
            }
        }
    });
    assert_eq!(with_views(saved).validate(), Ok(()));
    assert_eq!(
        with_views(json!(["board"])).validate(),
        Err(OperationValidationError::InvalidDocument)
    );
    let oversized = json!({
        "version": 1,
        "views": { "@workspace": { "order": ["x".repeat(MAX_DATABASE_VIEWS_BYTES)] } }
    });
    assert_eq!(
        with_views(oversized).validate(),
        Err(OperationValidationError::TooLong {
            field: "database layouts",
            maximum: MAX_DATABASE_VIEWS_BYTES,
        })
    );
}

#[test]
fn archive_rejects_unsupported_settings_version() {
    let mut archive = WorkspaceArchive {
        archive_version: WORKSPACE_ARCHIVE_VERSION,
        protocol_version: WORKSPACE_PROTOCOL_VERSION,
        exported_at: 10,
        active_note_id: None,
        nodes: Vec::new(),
        documents: Vec::new(),
        settings: WorkspaceSettings::default(),
        tags: Vec::new(),
        people: Vec::new(),
        properties: Vec::new(),
        property_templates: Vec::new(),
        tasks: Vec::new(),
        prompts: Vec::new(),
        annotations: Vec::new(),
        note_lock: None,
    };
    archive.settings.settings_version = 2;

    assert!(matches!(
        archive.validate(),
        Err(ArchiveValidationError::Invalid(_))
    ));
    archive.settings.settings_version = WORKSPACE_SETTINGS_VERSION;
    archive.validate().expect("supported settings version");
}

#[test]
fn rejects_active_note_below_trashed_ancestor() {
    let archive = WorkspaceArchive {
        archive_version: WORKSPACE_ARCHIVE_VERSION,
        protocol_version: WORKSPACE_PROTOCOL_VERSION,
        exported_at: 10,
        active_note_id: Some("note-1".into()),
        nodes: vec![
            WorkspaceNode {
                id: "folder-1".into(),
                kind: NodeKind::Folder,
                parent_id: None,
                rank: 1024,
                title: "Folder".into(),
                icon: None,
                cover_image_id: None,
                cover_gradient: None,
                cover_full_width: false,
                cover_position_x: 50.0,
                cover_position_y: 50.0,
                cover_zoom: 1.0,
                created_at: 1,
                updated_at: 5,
                deleted_at: Some(5),
                pinned_at: None,
                locked_at: None,
            },
            WorkspaceNode {
                id: "note-1".into(),
                kind: NodeKind::Note,
                parent_id: Some("folder-1".into()),
                rank: 1024,
                title: "Note".into(),
                icon: None,
                cover_image_id: None,
                cover_gradient: None,
                cover_full_width: false,
                cover_position_x: 50.0,
                cover_position_y: 50.0,
                cover_zoom: 1.0,
                created_at: 2,
                updated_at: 2,
                deleted_at: None,
                pinned_at: None,
                locked_at: None,
            },
        ],
        documents: vec![WorkspaceDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc"}),
            markdown: "# Note".into(),
            revision: 1,
            word_count: 1,
            sealed: None,
        }],
        settings: WorkspaceSettings::default(),
        tags: Vec::new(),
        people: Vec::new(),
        properties: Vec::new(),
        property_templates: Vec::new(),
        tasks: Vec::new(),
        prompts: Vec::new(),
        annotations: Vec::new(),
        note_lock: None,
    };

    assert!(matches!(
        archive.validate(),
        Err(ArchiveValidationError::Invalid(_))
    ));
}

#[test]
fn archive_validates_structured_reference_targets() {
    let mut archive = WorkspaceArchive {
        archive_version: WORKSPACE_ARCHIVE_VERSION,
        protocol_version: WORKSPACE_PROTOCOL_VERSION,
        exported_at: 1,
        active_note_id: None,
        nodes: vec![WorkspaceNode {
            id: "note-1".into(),
            kind: NodeKind::Note,
            parent_id: None,
            rank: 1,
            title: "Note".into(),
            icon: None,
            cover_image_id: None,
            cover_gradient: None,
            cover_full_width: false,
            cover_position_x: 50.0,
            cover_position_y: 50.0,
            cover_zoom: 1.0,
            created_at: 1,
            updated_at: 1,
            deleted_at: None,
            pinned_at: None,
            locked_at: None,
        }],
        documents: vec![WorkspaceDocument {
            note_id: "note-1".into(),
            document_json: json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"tag_ref","attrs":{"id":"tag-1","label":"Tag"}}]}]}),
            markdown: "#Tag".into(),
            revision: 1,
            word_count: 1,
            sealed: None,
        }],
        settings: WorkspaceSettings::default(),
        tags: vec![WorkspaceTag {
            id: "tag-1".into(),
            name: "Tag".into(),
            color: None,
            created_at: 0,
            updated_at: 0,
            created_in: None,
        }],
        people: Vec::new(),
        properties: Vec::new(),
        property_templates: Vec::new(),
        tasks: Vec::new(),
        prompts: Vec::new(),
        annotations: Vec::new(),
        note_lock: None,
    };
    archive.validate().expect("valid reference");
    archive.tags.clear();
    assert!(matches!(
        archive.validate(),
        Err(ArchiveValidationError::Invalid(_))
    ));
}

#[test]
fn collects_image_ids_from_documents() {
    let document = json!({
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [
                {"type": "image_ref", "attrs": {"id": "image-1", "alt": ""}},
                {"type": "text", "text": "hello"},
                {"type": "image_ref", "attrs": {"id": "image-2", "alt": ""}}
            ]},
            {"type": "blockquote", "content": [
                {"type": "paragraph", "content": [
                    {"type": "image_ref", "attrs": {"id": "image-1", "alt": ""}}
                ]}
            ]}
        ]
    });
    assert_eq!(super::document_image_ids(&document), ["image-1", "image-2"]);
    assert!(super::document_image_ids(&json!({"type": "doc"})).is_empty());
}

#[test]
fn collects_media_ref_ids_from_documents() {
    let document = json!({
        "type": "doc",
        "content": [
            {"type": "media", "attrs": {"kind": "video", "refId": "video-1", "src": "", "title": "clip"}},
            {"type": "media", "attrs": {"kind": "video", "refId": "", "src": "https://example.com/v.mp4", "title": ""}},
            {"type": "paragraph", "content": [
                {"type": "image_ref", "attrs": {"id": "image-1", "alt": ""}}
            ]}
        ]
    });
    assert_eq!(super::document_image_ids(&document), ["video-1", "image-1"]);
}
