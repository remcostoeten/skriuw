use super::*;

fn annotation_comment(id: &str, body: &str, at: i64) -> AnnotationComment {
    AnnotationComment {
        id: id.into(),
        body_markdown: body.into(),
        author_id: None,
        created_at: at,
        updated_at: at,
    }
}

fn open_annotation(id: &str, note_id: &str, anchor: &str, at: i64) -> WorkspaceAnnotation {
    WorkspaceAnnotation {
        id: id.into(),
        note_id: note_id.into(),
        status: AnnotationStatus::Open,
        anchor_text: anchor.into(),
        created_at: at,
        resolved_at: None,
        comments: vec![annotation_comment(&format!("{id}-first"), "Why this?", at)],
    }
}

fn annotated_workspace() -> SqliteWorkspace {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::CreateAnnotation {
                annotation: Box::new(open_annotation(
                    "annotation-1",
                    "note-1",
                    "the anchored words",
                    10,
                )),
            }),
        ])
        .expect("create annotation");
    storage
}

fn only_annotation(storage: &SqliteWorkspace) -> WorkspaceAnnotation {
    let mut annotations = storage.bootstrap().expect("bootstrap").annotations;
    assert_eq!(annotations.len(), 1, "expected exactly one annotation");
    annotations.remove(0)
}

#[test]
fn creating_a_thread_stores_its_opening_comment_in_the_same_step() {
    let annotation = only_annotation(&annotated_workspace());

    assert_eq!(annotation.status, AnnotationStatus::Open);
    assert_eq!(annotation.anchor_text, "the anchored words");
    assert_eq!(annotation.comments.len(), 1);
    assert_eq!(annotation.comments[0].body_markdown, "Why this?");
    assert!(annotation.comments[0].author_id.is_none());
}

#[test]
fn a_thread_against_a_missing_note_is_refused() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    let failure = storage.apply_operations(&[op(WorkspaceOperation::CreateAnnotation {
        annotation: Box::new(open_annotation("annotation-1", "note-absent", "words", 10)),
    })]);

    assert!(matches!(failure, Err(StorageError::NotFound(_))));
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap")
            .annotations
            .is_empty()
    );
}

#[test]
fn replies_and_edits_accumulate_in_creation_order() {
    let storage = annotated_workspace();
    storage
        .apply_operations(&[
            op(WorkspaceOperation::AddAnnotationComment {
                annotation_id: "annotation-1".into(),
                comment: Box::new(annotation_comment(
                    "comment-2",
                    "Because of the deadline",
                    20,
                )),
            }),
            op(WorkspaceOperation::UpdateAnnotationComment {
                annotation_id: "annotation-1".into(),
                comment_id: "comment-2".into(),
                body_markdown: "Because of the Friday deadline".into(),
                updated_at: 30,
            }),
        ])
        .expect("reply and edit");

    let annotation = only_annotation(&storage);
    let bodies = annotation
        .comments
        .iter()
        .map(|comment| comment.body_markdown.as_str())
        .collect::<Vec<_>>();
    assert_eq!(bodies, ["Why this?", "Because of the Friday deadline"]);
    assert_eq!(annotation.comments[1].updated_at, 30);
}

#[test]
fn deleting_the_last_comment_keeps_the_thread() {
    let storage = annotated_workspace();
    storage
        .apply_operations(&[op(WorkspaceOperation::DeleteAnnotationComment {
            annotation_id: "annotation-1".into(),
            comment_id: "annotation-1-first".into(),
        })])
        .expect("delete only comment");

    let annotation = only_annotation(&storage);
    assert!(
        annotation.comments.is_empty(),
        "the comment should be gone but the thread should remain"
    );
}

#[test]
fn resolving_is_reversible_and_deleting_is_not() {
    let storage = annotated_workspace();
    storage
        .apply_operations(&[op(WorkspaceOperation::ResolveAnnotation {
            id: "annotation-1".into(),
            at: 40,
        })])
        .expect("resolve");
    let resolved = only_annotation(&storage);
    assert_eq!(resolved.status, AnnotationStatus::Resolved);
    assert_eq!(resolved.resolved_at, Some(40));

    storage
        .apply_operations(&[op(WorkspaceOperation::ReopenAnnotation {
            id: "annotation-1".into(),
        })])
        .expect("reopen");
    let reopened = only_annotation(&storage);
    assert_eq!(reopened.status, AnnotationStatus::Open);
    assert_eq!(reopened.resolved_at, None);

    storage
        .apply_operations(&[op(WorkspaceOperation::DeleteAnnotation {
            id: "annotation-1".into(),
        })])
        .expect("delete");
    assert!(
        storage
            .bootstrap()
            .expect("bootstrap")
            .annotations
            .is_empty()
    );
}

#[test]
fn purging_a_note_takes_its_threads_with_it() {
    let storage = annotated_workspace();
    storage
        .apply_operations(&[
            op(WorkspaceOperation::TrashSubtree {
                root_id: "note-1".into(),
                at: 50,
            }),
            op(WorkspaceOperation::PurgeSubtree {
                root_id: "note-1".into(),
                trashed_before: 60,
            }),
        ])
        .expect("trash and purge");

    assert!(
        storage
            .bootstrap()
            .expect("bootstrap")
            .annotations
            .is_empty(),
        "a thread outlives its anchor text but not its note"
    );
}

#[test]
fn annotations_survive_an_archive_round_trip() {
    let storage = annotated_workspace();
    storage
        .apply_operations(&[op(WorkspaceOperation::ResolveAnnotation {
            id: "annotation-1".into(),
            at: 40,
        })])
        .expect("resolve");
    let exported = storage.export_archive(50).expect("export");

    let imported = SqliteWorkspace::open_in_memory().expect("open database");
    imported
        .replace_from_archive(&exported)
        .expect("import archive");

    assert_eq!(
        imported.export_archive(50).expect("re-export"),
        exported,
        "annotation archive round trip drifted"
    );
    let annotation = only_annotation(&imported);
    assert_eq!(annotation.status, AnnotationStatus::Resolved);
    assert_eq!(annotation.comments.len(), 1);
}
