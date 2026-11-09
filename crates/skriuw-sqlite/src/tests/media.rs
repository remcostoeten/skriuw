use super::*;

#[test]
fn attaches_images_and_shares_blobs_between_notes() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            create_note("note-2"),
            attach_image("image-1", "note-1", 'a'),
            attach_image("image-2", "note-2", 'a'),
        ])
        .expect("attach images");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.images.len(), 2);
    let distinct_hashes = snapshot
        .images
        .iter()
        .map(|image| image.content_hash.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(distinct_hashes.len(), 1);

    let duplicate = storage.apply_operations(&[attach_image("image-1", "note-1", 'a')]);
    assert!(matches!(duplicate, Err(StorageError::AlreadyExists(_))));
    let dangling = storage.apply_operations(&[attach_image("image-3", "missing-note", 'b')]);
    assert!(matches!(dangling, Err(StorageError::NotFound(_))));
}

#[test]
fn media_metadata_survives_image_detachment_and_clears_when_blanked() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    let content_hash = "a".repeat(64);
    storage
        .apply_operations(&[
            create_note("note-1"),
            attach_image("image-1", "note-1", 'a'),
        ])
        .expect("attach image");
    storage
        .apply_operations(&[op(WorkspaceOperation::SetMediaMetadata {
            metadata: skriuw_domain::MediaMetadata {
                content_hash: content_hash.clone(),
                name: "  Roadmap hero  ".into(),
                alt: "  Team wall  ".into(),
                updated_at: 4,
            },
        })])
        .expect("name the file");

    let stored = storage.bootstrap().expect("bootstrap").media_metadata;
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].content_hash, content_hash);
    assert_eq!(stored[0].name, "Roadmap hero");
    assert_eq!(stored[0].alt, "Team wall");

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc"}),
            markdown: String::new(),
            word_count: 0,
            expected_revision: 1,
            at: 5,
        })])
        .expect("detach every image");
    let after_detach = storage.bootstrap().expect("bootstrap");
    assert!(after_detach.images.is_empty());
    assert_eq!(
        after_detach.media_metadata.len(),
        1,
        "the name belongs to the stored bytes, not to one note's attachment"
    );

    storage
        .apply_operations(&[op(WorkspaceOperation::SetMediaMetadata {
            metadata: skriuw_domain::MediaMetadata {
                content_hash: content_hash.clone(),
                name: "   ".into(),
                alt: String::new(),
                updated_at: 6,
            },
        })])
        .expect("clear the name");
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap")
            .media_metadata
            .is_empty()
    );
}

#[test]
fn save_document_prunes_detached_image_rows() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            attach_image("image-1", "note-1", 'a'),
            attach_image("image-2", "note-1", 'b'),
        ])
        .expect("attach images");

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc", "content": [
                {"type": "paragraph", "content": [
                    {"type": "image_ref", "attrs": {"id": "image-1", "alt": ""}}
                ]}
            ]}),
            markdown: "![](images/image-1)".into(),
            word_count: 0,
            expected_revision: 1,
            at: 3,
        })])
        .expect("save with one image");

    let images = storage.bootstrap().expect("bootstrap").images;
    assert_eq!(images.len(), 1);
    assert_eq!(images[0].id, "image-1");
}

#[test]
fn note_cover_round_trips_and_survives_document_image_pruning() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            attach_image("cover-1", "note-1", 'a'),
            op(WorkspaceOperation::SetNoteCover {
                note_id: "note-1".into(),
                image_id: Some("cover-1".into()),
                at: 3,
            }),
            op(WorkspaceOperation::SetNoteCoverFullWidth {
                note_id: "note-1".into(),
                full_width: true,
                at: 3,
            }),
            op(WorkspaceOperation::SetNoteCoverTransform {
                note_id: "note-1".into(),
                position_x: 25.0,
                position_y: 70.0,
                zoom: 1.5,
                at: 3,
            }),
        ])
        .expect("set cover");

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc", "content": []}),
            markdown: String::new(),
            word_count: 0,
            expected_revision: 1,
            at: 4,
        })])
        .expect("save without inline images");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes[0].cover_image_id.as_deref(), Some("cover-1"));
    assert!(snapshot.nodes[0].cover_full_width);
    assert_eq!(snapshot.nodes[0].cover_position_x, 25.0);
    assert_eq!(snapshot.nodes[0].cover_position_y, 70.0);
    assert_eq!(snapshot.nodes[0].cover_zoom, 1.5);
    assert_eq!(snapshot.images[0].id, "cover-1");

    storage
        .apply_operations(&[op(WorkspaceOperation::SetNoteCover {
            note_id: "note-1".into(),
            image_id: None,
            at: 5,
        })])
        .expect("remove cover");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes[0].cover_image_id, None);
    assert!(!snapshot.nodes[0].cover_full_width);
    assert_eq!(snapshot.nodes[0].cover_position_x, 50.0);
    assert_eq!(snapshot.nodes[0].cover_position_y, 50.0);
    assert_eq!(snapshot.nodes[0].cover_zoom, 1.0);
    assert!(snapshot.images.is_empty());
}

#[test]
fn gradient_cover_replaces_an_image_cover_and_detaches_it() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            attach_image("cover-1", "note-1", 'a'),
            op(WorkspaceOperation::SetNoteCover {
                note_id: "note-1".into(),
                image_id: Some("cover-1".into()),
                at: 3,
            }),
            op(WorkspaceOperation::SetNoteCoverTransform {
                note_id: "note-1".into(),
                position_x: 25.0,
                position_y: 70.0,
                zoom: 1.5,
                at: 3,
            }),
        ])
        .expect("set image cover");

    storage
        .apply_operations(&[op(WorkspaceOperation::SetNoteCoverGradient {
            note_id: "note-1".into(),
            gradient: Some("ocean".into()),
            at: 4,
        })])
        .expect("set gradient cover");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes[0].cover_gradient.as_deref(), Some("ocean"));
    assert_eq!(snapshot.nodes[0].cover_image_id, None);
    assert_eq!(snapshot.nodes[0].cover_position_x, 50.0);
    assert_eq!(snapshot.nodes[0].cover_zoom, 1.0);
    assert!(
        snapshot.images.is_empty(),
        "an image kept only as a cover is detached when a gradient replaces it"
    );
}

#[test]
fn gradient_cover_supports_full_width_and_clears_on_removal() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::SetNoteCoverGradient {
                note_id: "note-1".into(),
                gradient: Some("dusk".into()),
                at: 2,
            }),
            op(WorkspaceOperation::SetNoteCoverFullWidth {
                note_id: "note-1".into(),
                full_width: true,
                at: 2,
            }),
        ])
        .expect("set gradient cover full width");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert!(snapshot.nodes[0].cover_full_width);

    storage
        .apply_operations(&[op(WorkspaceOperation::SetNoteCoverGradient {
            note_id: "note-1".into(),
            gradient: None,
            at: 3,
        })])
        .expect("remove gradient cover");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes[0].cover_gradient, None);
    assert!(!snapshot.nodes[0].cover_full_width);
}

#[test]
fn full_width_still_requires_a_cover_of_some_kind() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");
    let error = storage
        .apply_operations(&[op(WorkspaceOperation::SetNoteCoverFullWidth {
            note_id: "note-1".into(),
            full_width: true,
            at: 2,
        })])
        .expect_err("full width without a cover");
    assert!(matches!(error, StorageError::InvalidOperation(_)));
}

#[test]
fn an_image_cover_replaces_a_gradient_cover() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::SetNoteCoverGradient {
                note_id: "note-1".into(),
                gradient: Some("meadow".into()),
                at: 2,
            }),
            attach_image("cover-1", "note-1", 'a'),
            op(WorkspaceOperation::SetNoteCover {
                note_id: "note-1".into(),
                image_id: Some("cover-1".into()),
                at: 3,
            }),
        ])
        .expect("replace gradient with an image");
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert_eq!(snapshot.nodes[0].cover_gradient, None);
    assert_eq!(snapshot.nodes[0].cover_image_id.as_deref(), Some("cover-1"));
}

#[test]
fn note_cover_rejects_foreign_or_missing_images() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            create_note("note-2"),
            attach_image("image-1", "note-1", 'a'),
        ])
        .expect("seed");

    let foreign = storage.apply_operations(&[op(WorkspaceOperation::SetNoteCover {
        note_id: "note-2".into(),
        image_id: Some("image-1".into()),
        at: 3,
    })]);
    assert!(matches!(foreign, Err(StorageError::InvalidOperation(_))));
}

#[test]
fn purge_cascades_image_rows_with_their_note() {
    let storage = SqliteWorkspace::open_in_memory().expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            attach_image("image-1", "note-1", 'a'),
            op(WorkspaceOperation::TrashSubtree {
                root_id: "note-1".into(),
                at: 4,
            }),
            op(WorkspaceOperation::PurgeSubtree {
                root_id: "note-1".into(),
                trashed_before: 4,
            }),
        ])
        .expect("purge note");

    assert!(storage.bootstrap().expect("bootstrap").images.is_empty());
}

#[test]
fn referenced_image_hashes_and_file_image_rows_match_bootstrap() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("workspace.db");
    let storage = SqliteWorkspace::open(&path).expect("open");
    assert!(
        storage
            .referenced_image_hashes()
            .expect("empty hashes")
            .is_empty()
    );
    storage
        .apply_operations(&[
            create_note("note-1"),
            create_note("note-2"),
            attach_image("image-1", "note-1", 'a'),
            attach_image("image-2", "note-2", 'a'),
            attach_image("image-3", "note-2", 'b'),
        ])
        .expect("attach images");

    let snapshot = storage.bootstrap().expect("bootstrap");
    let expected = snapshot
        .images
        .iter()
        .map(|image| image.content_hash.clone())
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(expected.len(), 2);
    assert_eq!(storage.referenced_image_hashes().expect("hashes"), expected);
    assert_eq!(
        SqliteWorkspace::read_database_images(&path).expect("file images"),
        snapshot.images
    );
}
