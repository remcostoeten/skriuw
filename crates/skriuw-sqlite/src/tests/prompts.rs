use super::*;

fn prompt(id: &str, name: &str, built_in_id: Option<&str>, at: i64) -> WorkspacePrompt {
    WorkspacePrompt {
        id: id.into(),
        name: name.into(),
        system_prompt: "Rewrite the text in my own house style.".into(),
        input_shape: skriuw_domain::PromptInputShape::Selection,
        parameters: skriuw_domain::PromptParameters {
            temperature_millis: Some(450),
            max_output_bytes: 65_536,
        },
        built_in_id: built_in_id.map(str::to_owned),
        created_at: at,
        updated_at: at,
    }
}

fn set_prompt(prompt: WorkspacePrompt) -> WorkspaceOperationEnvelope {
    op(WorkspaceOperation::SetPrompt {
        prompt: Box::new(prompt),
    })
}

#[test]
fn a_user_prompt_is_created_edited_and_deleted() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");

    storage
        .apply_operations(&[set_prompt(prompt("prompt-1", "Standup", None, 10))])
        .expect("create the prompt");
    assert_eq!(
        storage.bootstrap().expect("bootstrap").prompts,
        vec![prompt("prompt-1", "Standup", None, 10)]
    );

    let mut edited = prompt("prompt-1", "Standup summary", None, 10);
    edited.system_prompt = "Three bullets: done, next, blocked.".into();
    edited.updated_at = 20;
    storage
        .apply_operations(&[set_prompt(edited.clone())])
        .expect("edit the prompt");
    assert_eq!(
        storage.bootstrap().expect("bootstrap").prompts,
        vec![edited]
    );

    storage
        .apply_operations(&[op(WorkspaceOperation::DeletePrompt {
            id: "prompt-1".into(),
        })])
        .expect("delete the prompt");
    assert!(storage.bootstrap().expect("bootstrap").prompts.is_empty());

    let missing = storage.apply_operations(&[op(WorkspaceOperation::DeletePrompt {
        id: "prompt-1".into(),
    })]);
    assert!(
        matches!(missing, Err(StorageError::NotFound(id)) if id == "prompt-1"),
        "deleting an absent prompt must fail loudly"
    );
}

#[test]
fn a_built_in_can_be_shadowed_once_and_reset_by_deleting_the_shadow() {
    let storage = SqliteWorkspace::open_in_memory().expect("open database");

    storage
        .apply_operations(&[set_prompt(prompt(
            "prompt-1",
            "Rewrite",
            Some("rewrite"),
            10,
        ))])
        .expect("shadow the built-in");

    let second = storage.apply_operations(&[set_prompt(prompt(
        "prompt-2",
        "Rewrite again",
        Some("rewrite"),
        11,
    ))]);
    assert!(
        matches!(second, Err(StorageError::InvalidOperation(message)) if message.contains("already customised")),
        "a built-in cannot be customised twice"
    );

    let rehomed = storage.apply_operations(&[set_prompt(prompt(
        "prompt-1",
        "Rewrite",
        Some("improve"),
        12,
    ))]);
    assert!(
        matches!(rehomed, Err(StorageError::InvalidOperation(message)) if message.contains("cannot change which built-in")),
        "an edit cannot move a shadow onto another built-in"
    );

    storage
        .apply_operations(&[op(WorkspaceOperation::DeletePrompt {
            id: "prompt-1".into(),
        })])
        .expect("reset the built-in");
    assert!(storage.bootstrap().expect("bootstrap").prompts.is_empty());

    storage
        .apply_operations(&[set_prompt(prompt(
            "prompt-3",
            "Rewrite",
            Some("rewrite"),
            13,
        ))])
        .expect("the built-in can be customised again after a reset");
}

#[test]
fn prompts_survive_restart_and_archive_round_trip() {
    let directory = tempdir().expect("tempdir");
    let path = directory.path().join("prompts-restart.db");
    let exported = {
        let storage = SqliteWorkspace::open(&path).expect("open database");
        storage
            .apply_operations(&[
                set_prompt(prompt("prompt-shadow", "Rewrite", Some("rewrite"), 10)),
                set_prompt(prompt("prompt-own", "Standup", None, 11)),
            ])
            .expect("create prompts");
        storage.export_archive(50).expect("export archive")
    };

    let reopened = SqliteWorkspace::open(&path).expect("reopen database");
    let restarted = reopened.bootstrap().expect("bootstrap").prompts;
    assert_eq!(
        restarted
            .iter()
            .map(|prompt| prompt.id.as_str())
            .collect::<Vec<_>>(),
        vec!["prompt-shadow", "prompt-own"]
    );
    assert_eq!(
        restarted[0].built_in_id.as_deref(),
        Some("rewrite"),
        "the shadow link must survive a restart"
    );

    let imported = SqliteWorkspace::open_in_memory().expect("open import target");
    imported
        .replace_from_archive(&exported)
        .expect("import archive");
    assert_eq!(
        imported.bootstrap().expect("bootstrap").prompts,
        exported.prompts
    );
    assert_eq!(
        imported.export_archive(50).expect("re-export"),
        exported,
        "prompt archive round trip drifted"
    );
}
