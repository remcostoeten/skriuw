use super::*;

fn checklist_document(link: Option<(&str, &str)>, checked: bool, title: &str) -> serde_json::Value {
    let (task_id, block_id) = match link {
        Some((task_id, block_id)) => (json!(task_id), json!(block_id)),
        None => (json!(null), json!(null)),
    };
    json!({
        "type": "doc",
        "content": [{
            "type": "check_list",
            "content": [{
                "type": "check_item",
                "attrs": { "checked": checked, "taskId": task_id, "blockId": block_id },
                "content": [{
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": title }],
                }],
            }],
        }],
    })
}

fn source_document(
    note_id: &str,
    expected_revision: i64,
    link: Option<(&str, &str)>,
    checked: bool,
    title: &str,
) -> TaskSourceDocument {
    TaskSourceDocument {
        note_id: note_id.into(),
        document_json: checklist_document(link, checked, title),
        markdown: format!("- [{}] {title}", if checked { "x" } else { " " }),
        word_count: title.split_whitespace().count() as i64,
        expected_revision,
    }
}

fn promoted_task(id: &str, note_id: &str, block_id: &str, title: &str, at: i64) -> WorkspaceTask {
    WorkspaceTask {
        id: id.into(),
        title: title.into(),
        status: TaskStatus::Todo,
        priority: TaskPriority::Medium,
        due_date: None,
        description: String::new(),
        tag_ids: Vec::new(),
        assignee_ids: Vec::new(),
        source: Some(TaskSource {
            note_id: note_id.into(),
            block_id: block_id.into(),
        }),
        detached_at: None,
        created_at: at,
        updated_at: at,
    }
}

fn promote(task: WorkspaceTask, document: TaskSourceDocument) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::PromoteChecklistTask {
        task: Box::new(task),
        document: Box::new(document),
    })
}

fn promoted_workspace() -> SqliteWorkspace {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_note("note-1"),
            promote(
                promoted_task("task-1", "note-1", "block-1", "Ship the release", 5),
                source_document(
                    "note-1",
                    1,
                    Some(("task-1", "block-1")),
                    false,
                    "Ship the release",
                ),
            ),
        ])
        .expect("promote checklist item");
    storage
}

fn only_task(storage: &SqliteWorkspace) -> WorkspaceTask {
    let mut tasks = storage.bootstrap().expect("bootstrap").tasks;
    assert_eq!(tasks.len(), 1, "expected exactly one task");
    tasks.remove(0)
}

#[test]
fn promotion_writes_the_task_and_the_checklist_link_together() {
    let storage = promoted_workspace();
    let snapshot = storage.bootstrap().expect("bootstrap");

    let task = only_task(&storage);
    assert_eq!(
        task.source,
        Some(TaskSource {
            note_id: "note-1".into(),
            block_id: "block-1".into(),
        })
    );
    assert_eq!(task.title, "Ship the release");
    assert_eq!(task.status, TaskStatus::Todo);
    let document = snapshot
        .documents
        .iter()
        .find(|document| document.note_id == "note-1")
        .expect("source document");
    assert_eq!(document.revision, 2);
    let links = skriuw_domain::document_task_links(&document.document_json);
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].task_id, "task-1");
}

#[test]
fn failed_promotion_leaves_neither_the_task_nor_the_document_change() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let stale = promote(
        promoted_task("task-1", "note-1", "block-1", "Ship the release", 5),
        source_document(
            "note-1",
            9,
            Some(("task-1", "block-1")),
            false,
            "Ship the release",
        ),
    );
    assert!(matches!(
        storage.apply_operations(&[stale]),
        Err(StorageError::RevisionConflict { .. })
    ));

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert!(snapshot.tasks.is_empty());
    assert_eq!(snapshot.documents[0].revision, 1);
}

#[test]
fn promotion_without_the_link_in_the_document_is_rejected() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[create_note("note-1")])
        .expect("create note");

    let unlinked = promote(
        promoted_task("task-1", "note-1", "block-1", "Ship the release", 5),
        source_document("note-1", 1, None, false, "Ship the release"),
    );
    assert!(matches!(
        storage.apply_operations(&[unlinked]),
        Err(StorageError::InvalidOperation(_))
    ));
    assert!(storage.bootstrap().expect("bootstrap").tasks.is_empty());
}

#[test]
fn ordinary_checklist_items_never_create_tasks() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");
    storage
        .apply_operations(&[
            create_note("note-1"),
            op(WorkspaceOperation::SaveDocument {
                note_id: "note-1".into(),
                document_json: checklist_document(None, false, "Buy milk"),
                markdown: "- [ ] Buy milk".into(),
                word_count: 2,
                expected_revision: 1,
                at: 3,
            }),
        ])
        .expect("save ordinary checklist");

    assert!(storage.bootstrap().expect("bootstrap").tasks.is_empty());
}

#[test]
fn the_source_checkbox_owns_task_completion() {
    let storage = promoted_workspace();

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: checklist_document(Some(("task-1", "block-1")), true, "Ship it"),
            markdown: "- [x] Ship it".into(),
            word_count: 2,
            expected_revision: 2,
            at: 7,
        })])
        .expect("check the source item");
    let task = only_task(&storage);
    assert_eq!(task.status, TaskStatus::Done);
    assert_eq!(task.title, "Ship it");
    assert_eq!(task.updated_at, 7);

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: checklist_document(Some(("task-1", "block-1")), false, "Ship it"),
            markdown: "- [ ] Ship it".into(),
            word_count: 2,
            expected_revision: 3,
            at: 8,
        })])
        .expect("uncheck the source item");
    assert_eq!(only_task(&storage).status, TaskStatus::Todo);
}

#[test]
fn the_source_checklist_item_owns_the_due_date() {
    let storage = promoted_workspace();
    let mut dated = checklist_document(Some(("task-1", "block-1")), false, "Ship the release");
    dated["content"][0]["content"][0]["attrs"]["dueDate"] = json!("2026-10-01");

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: dated,
            markdown:
                "- [ ] Ship the release <!--skriuw-task:task-1:block-1--> \u{1F4C5} 2026-10-01"
                    .into(),
            word_count: 3,
            expected_revision: 2,
            at: 7,
        })])
        .expect("date the source item");
    let task = only_task(&storage);
    assert_eq!(task.due_date.as_deref(), Some("2026-10-01"));
    assert_eq!(task.updated_at, 7);

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: checklist_document(
                Some(("task-1", "block-1")),
                false,
                "Ship the release",
            ),
            markdown: "- [ ] Ship the release <!--skriuw-task:task-1:block-1-->".into(),
            word_count: 3,
            expected_revision: 3,
            at: 8,
        })])
        .expect("clear the date in the source item");
    assert_eq!(only_task(&storage).due_date, None);
}

#[test]
fn deleting_the_source_block_detaches_the_task_instead_of_losing_it() {
    let storage = promoted_workspace();

    storage
        .apply_operations(&[op(WorkspaceOperation::SaveDocument {
            note_id: "note-1".into(),
            document_json: json!({"type": "doc", "content": []}),
            markdown: String::new(),
            word_count: 0,
            expected_revision: 2,
            at: 9,
        })])
        .expect("remove the source item");

    let task = only_task(&storage);
    assert_eq!(task.source, None);
    assert_eq!(task.detached_at, Some(9));
    assert_eq!(task.title, "Ship the release");
}

#[test]
fn trashing_keeps_the_link_and_purging_detaches_the_task() {
    let storage = promoted_workspace();

    storage
        .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
            root_id: "note-1".into(),
            at: 20,
        })])
        .expect("trash the source note");
    assert!(only_task(&storage).source.is_some());

    storage
        .apply_operations(&[op(WorkspaceOperation::PurgeSubtree {
            root_id: "note-1".into(),
            trashed_before: 30,
        })])
        .expect("purge the source note");
    let task = only_task(&storage);
    assert_eq!(task.source, None);
    assert_eq!(task.detached_at, Some(30));
}

#[test]
fn task_updates_cannot_move_or_drop_the_source_link() {
    let storage = promoted_workspace();
    let task = only_task(&storage);

    let mut relinked = task.clone();
    relinked.source = Some(TaskSource {
        note_id: "note-1".into(),
        block_id: "block-other".into(),
    });
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::UpdateTask {
            task: Box::new(relinked),
            document: None,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));

    let mut unlinked = task.clone();
    unlinked.source = None;
    assert!(matches!(
        storage.apply_operations(&[op(WorkspaceOperation::UpdateTask {
            task: Box::new(unlinked),
            document: None,
        })]),
        Err(StorageError::InvalidOperation(_))
    ));

    assert_eq!(only_task(&storage).source, task.source);
}

#[test]
fn detaching_clears_both_halves_of_the_link() {
    let storage = promoted_workspace();

    storage
        .apply_operations(&[op(WorkspaceOperation::DetachTask {
            id: "task-1".into(),
            document: Some(Box::new(source_document(
                "note-1",
                2,
                None,
                false,
                "Ship the release",
            ))),
            at: 12,
        })])
        .expect("detach the task");

    let task = only_task(&storage);
    assert_eq!(task.source, None);
    assert_eq!(task.detached_at, Some(12));
    let snapshot = storage.bootstrap().expect("bootstrap");
    assert!(skriuw_domain::document_task_links(&snapshot.documents[0].document_json).is_empty());
}

#[test]
fn deleting_a_task_clears_the_link_and_tombstones_the_identity() {
    let storage = promoted_workspace();

    storage
        .apply_operations(&[op(WorkspaceOperation::DeleteTask {
            id: "task-1".into(),
            document: Some(Box::new(source_document(
                "note-1",
                2,
                None,
                false,
                "Ship the release",
            ))),
            at: 15,
        })])
        .expect("delete the task");

    let snapshot = storage.bootstrap().expect("bootstrap");
    assert!(snapshot.tasks.is_empty());
    assert!(skriuw_domain::document_task_links(&snapshot.documents[0].document_json).is_empty());

    let recreated = storage.apply_operations(&[promote(
        promoted_task("task-1", "note-1", "block-1", "Ship the release", 16),
        source_document(
            "note-1",
            3,
            Some(("task-1", "block-1")),
            false,
            "Ship the release",
        ),
    )]);
    assert!(recreated.is_ok(), "local recreation stays allowed");
}

#[test]
fn tasks_survive_restart_and_archive_round_trip() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("tasks-restart.db");
    let exported = {
        let storage = SqliteWorkspace::open(&path).expect("open database");
        storage
            .apply_operations(&[
                create_note("note-1"),
                promote(
                    promoted_task("task-1", "note-1", "block-1", "Ship the release", 5),
                    source_document(
                        "note-1",
                        1,
                        Some(("task-1", "block-1")),
                        false,
                        "Ship the release",
                    ),
                ),
            ])
            .expect("promote checklist item");
        storage.export_archive(50).expect("export archive")
    };

    let reopened = SqliteWorkspace::open(&path).expect("reopen database");
    let restarted = only_task(&reopened);
    assert_eq!(restarted.id, "task-1");
    assert_eq!(
        restarted.source.as_ref().map(|source| &source.block_id),
        Some(&"block-1".to_string())
    );

    let imported = SqliteWorkspace::open_in_memory().expect("open import target");
    imported
        .replace_from_archive(&exported)
        .expect("import archive");
    assert_eq!(
        imported.bootstrap().expect("bootstrap").tasks,
        exported.tasks
    );
    assert_eq!(
        imported.export_archive(50).expect("re-export"),
        exported,
        "task archive round trip drifted"
    );
}

#[test]
fn stale_editor_saves_cannot_undo_task_toggles_after_restart() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("task-races.db");
    let storage = SqliteWorkspace::open(&path).expect("open");
    storage
        .apply_operations(&[
            create_note("note-1"),
            promote(
                promoted_task("task-1", "note-1", "block-1", "Draft", 5),
                source_document("note-1", 1, Some(("task-1", "block-1")), false, "Draft"),
            ),
        ])
        .expect("promote");
    for round in 0..30 {
        let before = storage.bootstrap().expect("bootstrap");
        let revision = before.documents[0].revision;
        let mut task = only_task(&storage);
        let checked = round % 2 == 0;
        task.status = if checked {
            TaskStatus::Done
        } else {
            TaskStatus::Todo
        };
        task.title = format!("Accepted edit {round}");
        task.updated_at = 10 + round;
        storage
            .apply_operations(&[op(WorkspaceOperation::UpdateTask {
                document: Some(Box::new(source_document(
                    "note-1",
                    revision,
                    Some(("task-1", "block-1")),
                    checked,
                    &task.title,
                ))),
                task: Box::new(task.clone()),
            })])
            .expect("paired write");
        assert!(matches!(
            storage.apply_operations(&[op(WorkspaceOperation::SaveDocument {
                note_id: "note-1".into(),
                document_json: before.documents[0].document_json.clone(),
                markdown: before.documents[0].markdown.clone(),
                word_count: before.documents[0].word_count,
                expected_revision: revision,
                at: 100 + round,
            })]),
            Err(StorageError::RevisionConflict { .. })
        ));
        let reopened = SqliteWorkspace::open(&path).expect("reopen");
        let snapshot = reopened.bootstrap().expect("restart snapshot");
        assert_eq!(snapshot.tasks[0], task);
        assert!(snapshot.documents[0].markdown.contains(&task.title));
        assert_eq!(
            snapshot.documents[0].document_json["content"][0]["content"][0]["attrs"]["checked"],
            checked
        );
    }
}
