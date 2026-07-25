use std::{
    env,
    error::Error,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::ExitCode,
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::json;
use skriuw_domain::{
    NodePlacement, WorkspaceArchive, WorkspaceOperation, WorkspaceOperationEnvelope,
};
use skriuw_history::HistoryReader;
use skriuw_history_git::GitHistoryReader;
use skriuw_lifecycle::{DatabaseSwapOutcome, replace_live_database};
use skriuw_runtime::WorkspaceRuntime;
use skriuw_sqlite::{BackupRetentionPolicy, BackupRotationOutcome, SqliteWorkspace};
use skriuw_storage::{
    Diagnostic, DiagnosticCategory, DiagnosticContext, HistoryCache, WorkspaceMaintenance,
    WorkspaceStorage,
};
use uuid::Uuid;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let mut arguments = env::args().skip(1);
    let command = arguments.next().unwrap_or_else(|| "help".into());

    match command.as_str() {
        "init" => {
            let path = required_path(arguments.next())?;
            ensure_parent(&path)?;
            let storage = SqliteWorkspace::open(&path)?;
            println!(
                "initialized {} ({})",
                path.display(),
                storage.quick_check()?
            );
        }
        "check" => {
            let path = required_path(arguments.next())?;
            let storage = SqliteWorkspace::open(&path)?;
            println!("{}", storage.quick_check()?);
        }
        "snapshot" => {
            let path = required_path(arguments.next())?;
            let storage = SqliteWorkspace::open(&path)?;
            println!("{}", serde_json::to_string_pretty(&storage.bootstrap()?)?);
        }
        "seed" => {
            let path = required_path(arguments.next())?;
            ensure_parent(&path)?;
            let storage = SqliteWorkspace::open(&path)?;
            let id = Uuid::new_v4().to_string();
            storage.apply_operations(&[feature_showcase_operation(id.clone(), now_ms()?)])?;
            println!("seeded note {id}");
        }
        "search" => {
            let path = required_path(arguments.next())?;
            let query = arguments.next().ok_or("search requires a query")?;
            let storage = SqliteWorkspace::open(&path)?;
            println!(
                "{}",
                serde_json::to_string_pretty(&storage.search(&query, 20)?)?
            );
        }
        "integrity" => {
            let path = required_path(arguments.next())?;
            let storage = SqliteWorkspace::open(&path)
                .map_err(|error| error.diagnostic(DiagnosticContext::Integrity))?;
            let report = storage
                .integrity_check()
                .map_err(|error| error.diagnostic(DiagnosticContext::Integrity))?;
            if report.healthy {
                println!("ok");
            } else {
                return Err(Diagnostic::new(
                    DiagnosticContext::Integrity,
                    DiagnosticCategory::Backend,
                    format!("integrity check found {} issue(s)", report.issues.len()),
                )
                .into());
            }
        }
        "history-integrity" => {
            let repository_path = required_path(arguments.next())?;
            let reader =
                GitHistoryReader::open(&repository_path).map_err(|error| error.diagnostic())?;
            let report = reader
                .integrity_check()
                .map_err(|error| error.diagnostic())?;
            if !report.healthy() {
                return Err(report.diagnostic().into());
            }
            println!(
                "ok: {} commit(s), {} note(s)",
                report.commit_count, report.note_count
            );
        }
        "history-rebuild-cache" => {
            let database_path = required_path(arguments.next())?;
            let repository_path = required_path(arguments.next())?;
            let reader =
                GitHistoryReader::open(&repository_path).map_err(|error| error.diagnostic())?;
            let headers = reader.list_headers().map_err(|error| error.diagnostic())?;
            let storage = SqliteWorkspace::open(&database_path)
                .map_err(|error| error.diagnostic(DiagnosticContext::History))?;
            let cached = storage
                .replace_history_headers(&headers)
                .map_err(|error| error.diagnostic(DiagnosticContext::History))?;
            println!("cached {cached} history header(s)");
        }
        "backup" => {
            let path = required_path(arguments.next())?;
            let backup_path = required_path(arguments.next())?;
            let storage = SqliteWorkspace::open(&path)
                .map_err(|error| error.diagnostic(DiagnosticContext::Backup))?;
            storage
                .backup_to(&backup_path)
                .map_err(|error| error.diagnostic(DiagnosticContext::Backup))?;
            println!("backed up {} to {}", path.display(), backup_path.display());
        }
        "backup-rotate" => {
            let path = required_path(arguments.next())?;
            let directory = required_path(arguments.next())?;
            let storage = SqliteWorkspace::open(&path)
                .map_err(|error| error.diagnostic(DiagnosticContext::Backup))?;
            match storage
                .create_scheduled_backup(&directory, now_ms()?, BackupRetentionPolicy::default())
                .map_err(|error| error.diagnostic(DiagnosticContext::Backup))?
            {
                BackupRotationOutcome::Skipped { next_due_at } => {
                    println!("scheduled backup is not due until {next_due_at}");
                }
                BackupRotationOutcome::Created {
                    artifact,
                    manifest_filename,
                    pruned,
                } => {
                    println!(
                        "created {} with {}; pruned {} artifact(s)",
                        artifact.filename,
                        manifest_filename,
                        pruned.len()
                    );
                }
            }
        }
        "backup-manifest" => {
            let directory = required_path(arguments.next())?;
            let manifest = SqliteWorkspace::read_recovery_manifest(&directory)
                .map_err(|error| error.diagnostic(DiagnosticContext::Recovery))?
                .ok_or_else(|| {
                    Diagnostic::new(
                        DiagnosticContext::Recovery,
                        DiagnosticCategory::NotFound,
                        "recovery manifest was not found",
                    )
                })?;
            println!("{}", serde_json::to_string_pretty(&manifest)?);
        }
        "restore" => {
            let backup_path = required_path(arguments.next())?;
            let target = required_path(arguments.next())?;
            SqliteWorkspace::restore_backup_to(&backup_path, &target)
                .map_err(|error| error.diagnostic(DiagnosticContext::Recovery))?;
            println!("restored {} to {}", backup_path.display(), target.display());
        }
        "swap-database" => {
            let canonical = required_path(arguments.next())?;
            let candidate = required_path(arguments.next())?;
            let rollback = required_path(arguments.next())?;
            let storage = SqliteWorkspace::open(&canonical)
                .map_err(|error| error.diagnostic(DiagnosticContext::Recovery))?;
            let current = WorkspaceRuntime::spawn(storage);
            match replace_live_database(&current, &canonical, &candidate, &rollback)
                .map_err(|error| error.diagnostic())?
            {
                DatabaseSwapOutcome::Replaced {
                    runtime,
                    snapshot,
                    rollback_path,
                } => {
                    runtime.shutdown().map_err(|error| error.diagnostic())?;
                    println!(
                        "replaced database with {} node(s); rollback {}",
                        snapshot.nodes.len(),
                        rollback_path.display()
                    );
                }
                DatabaseSwapOutcome::RolledBack {
                    runtime, failure, ..
                } => {
                    runtime.shutdown().map_err(|error| error.diagnostic())?;
                    return Err(failure.diagnostic().into());
                }
            }
        }
        "export" => {
            let path = required_path(arguments.next())?;
            let archive_path = required_path(arguments.next())?;
            let storage = SqliteWorkspace::open(&path)?;
            let archive = storage.export_archive(now_ms()?)?;
            let mut bytes = serde_json::to_vec_pretty(&archive)?;
            bytes.push(b'\n');
            write_new(&archive_path, &bytes)?;
            println!("exported {} to {}", path.display(), archive_path.display());
        }
        "import" => {
            let path = required_path(arguments.next())?;
            let archive_path = required_path(arguments.next())?;
            let raw = fs::read(&archive_path).map_err(|_| {
                Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::Backend,
                    "workspace archive could not be read",
                )
            })?;
            let archive = serde_json::from_slice::<WorkspaceArchive>(&raw).map_err(|_| {
                Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::InvalidInput,
                    "workspace archive is not valid JSON",
                )
            })?;
            archive.validate().map_err(|_| {
                Diagnostic::new(
                    DiagnosticContext::Recovery,
                    DiagnosticCategory::InvalidInput,
                    "workspace archive is invalid",
                )
            })?;
            let storage = SqliteWorkspace::open(&path)
                .map_err(|error| error.diagnostic(DiagnosticContext::Recovery))?;
            let backup_path = pre_import_backup_path(&path, now_ms()?)?;
            storage
                .backup_to(&backup_path)
                .map_err(|error| error.diagnostic(DiagnosticContext::Backup))?;
            let summary = storage
                .replace_from_archive(&archive)
                .map_err(|error| error.diagnostic(DiagnosticContext::Recovery))?;
            println!(
                "imported {} nodes and {} documents; safety backup {}",
                summary.nodes,
                summary.documents,
                backup_path.display()
            );
        }
        "help" | "--help" | "-h" => print_help(),
        other => return Err(format!("unknown command: {other}").into()),
    }

    Ok(())
}

fn required_path(value: Option<String>) -> Result<PathBuf, Box<dyn Error>> {
    value
        .map(PathBuf::from)
        .ok_or_else(|| "database path is required".into())
}

fn ensure_parent(path: &Path) -> Result<(), Box<dyn Error>> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn now_ms() -> Result<i64, Box<dyn Error>> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as i64)
}

fn feature_showcase_operation(id: String, at: i64) -> WorkspaceOperationEnvelope {
    WorkspaceOperationEnvelope::v1(WorkspaceOperation::CreateNote {
        id: id.clone(),
        title: "Feature showcase".into(),
        placement: NodePlacement::last(None),
        document_json: json!({
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 1},
                    "content": [{"type": "text", "text": "Feature showcase"}]
                },
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "marks": [{"type": "strong"}], "text": "Bold"},
                        {"type": "text", "text": ", "},
                        {"type": "text", "marks": [{"type": "em"}], "text": "italic"},
                        {"type": "text", "text": ", "},
                        {"type": "text", "marks": [{"type": "strikethrough"}], "text": "strikethrough"},
                        {"type": "text", "text": ", and "},
                        {"type": "text", "marks": [{"type": "code"}], "text": "inline code"},
                        {"type": "text", "text": "."}
                    ]
                },
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Open the "},
                        {
                            "type": "text",
                            "marks": [{
                                "type": "link",
                                "attrs": {"href": "https://example.com/docs", "title": null}
                            }],
                            "text": "documentation link"
                        },
                        {"type": "text", "text": " or follow the stable self reference "},
                        {
                            "type": "mention_ref",
                            "attrs": {
                                "kind": "note",
                                "id": id,
                                "label": "Feature showcase"
                            }
                        },
                        {"type": "text", "text": "."}
                    ]
                },
                {
                    "type": "blockquote",
                    "content": [{
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "Local-first, portable, and fast."}]
                    }]
                },
                {
                    "type": "bullet_list",
                    "content": [
                        {
                            "type": "list_item",
                            "content": [{
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Bullet list"}]
                            }]
                        },
                        {
                            "type": "list_item",
                            "content": [{
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Drag this block to reorder it"}]
                            }]
                        }
                    ]
                },
                {
                    "type": "ordered_list",
                    "attrs": {"order": 1},
                    "content": [
                        {
                            "type": "list_item",
                            "content": [{
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Open the command palette"}]
                            }]
                        },
                        {
                            "type": "list_item",
                            "content": [{
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Toggle raw Markdown mode"}]
                            }]
                        }
                    ]
                },
                {
                    "type": "check_list",
                    "content": [
                        {
                            "type": "check_item",
                            "attrs": {"checked": true},
                            "content": [{
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Seed the showcase"}]
                            }]
                        },
                        {
                            "type": "check_item",
                            "attrs": {"checked": false},
                            "content": [{
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Try editing and restoring history"}]
                            }]
                        }
                    ]
                },
                {
                    "type": "code_block",
                    "attrs": {"params": "rust"},
                    "content": [{"type": "text", "text": "fn main() {\n    println!(\"Skriuw\");\n}"}]
                },
                {
                    "type": "table",
                    "content": [
                        {
                            "type": "table_row",
                            "content": [
                                {
                                    "type": "table_header",
                                    "content": [{
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": "Feature"}]
                                    }]
                                },
                                {
                                    "type": "table_header",
                                    "content": [{
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": "State"}]
                                    }]
                                }
                            ]
                        },
                        {
                            "type": "table_row",
                            "content": [
                                {
                                    "type": "table_cell",
                                    "content": [{
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": "Markdown transfer"}]
                                    }]
                                },
                                {
                                    "type": "table_cell",
                                    "content": [{
                                        "type": "paragraph",
                                        "content": [{"type": "text", "text": "Lossless"}]
                                    }]
                                }
                            ]
                        }
                    ]
                },
                {
                    "type": "paragraph",
                    "content": [{
                        "type": "image",
                        "attrs": {
                            "src": "https://example.com/blocked-demo.png",
                            "alt": "Remote image blocked by default",
                            "title": null
                        }
                    }]
                },
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": "Lossless raw-source example"}]
                },
                {
                    "type": "code_block",
                    "attrs": {"params": "markdown"},
                    "content": [{
                        "type": "text",
                        "text": "---\ntitle: Preserved exactly\n---\n\nFootnote source[^1].\n\n[^1]: Never silently transformed."
                    }]
                }
            ]
        }),
        markdown: FEATURE_SHOWCASE_MARKDOWN.into(),
        at,
    })
}

const FEATURE_SHOWCASE_MARKDOWN: &str = r#"# Feature showcase

**Bold**, *italic*, ~~strikethrough~~, and `inline code`.

Open the [documentation link](https://example.com/docs) or follow the stable self reference [[Feature showcase]].

> Local-first, portable, and fast.

* Bullet list
* Drag this block to reorder it

1. Open the command palette
2. Toggle raw Markdown mode

- [x] Seed the showcase
- [ ] Try editing and restoring history

```rust
fn main() {
    println!("Skriuw");
}
```

| Feature | State |
| --- | --- |
| Markdown transfer | Lossless |

![Remote image blocked by default](https://example.com/blocked-demo.png)

## Lossless raw-source example

```markdown
---
title: Preserved exactly
---

Footnote source[^1].

[^1]: Never silently transformed.
```
"#;

fn write_new(path: &Path, bytes: &[u8]) -> Result<(), Box<dyn Error>> {
    ensure_parent(path)?;
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn pre_import_backup_path(path: &Path, at: i64) -> Result<PathBuf, Box<dyn Error>> {
    let filename = path
        .file_name()
        .and_then(|filename| filename.to_str())
        .ok_or("database path has no filename")?;
    Ok(path.with_file_name(format!("{filename}.pre-import-{at}.backup")))
}

fn print_help() {
    println!(
        "skriuw-cli\n\n\
         commands:\n\
           init <database>\n\
           check <database>\n\
           snapshot <database>\n\
           seed <database>\n\
           search <database> <query>\n\
           integrity <database>\n\
           history-integrity <history-repository>\n\
           history-rebuild-cache <database> <history-repository>\n\
           backup <database> <backup>\n\
           backup-rotate <database> <recovery-directory>\n\
           backup-manifest <recovery-directory>\n\
           restore <backup> <new-database>\n\
           swap-database <canonical> <candidate> <rollback>\n\
           export <database> <archive.json>\n\
           import <database> <archive.json>"
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_showcase_seed_covers_the_editor_and_transfer_safety_states() {
        let operation = feature_showcase_operation("showcase-id".into(), 42);
        let WorkspaceOperation::CreateNote {
            id,
            title,
            document_json,
            markdown,
            at,
            ..
        } = operation.operation
        else {
            panic!("expected a note seed");
        };

        let serialized = serde_json::to_string(&document_json).expect("serialize document");
        assert_eq!(id, "showcase-id");
        assert_eq!(title, "Feature showcase");
        assert_eq!(at, 42);
        for node_type in ["mention_ref", "check_list", "code_block", "table", "image"] {
            assert!(serialized.contains(&format!("\"type\":\"{node_type}\"")));
        }
        assert!(serialized.contains("\"id\":\"showcase-id\""));
        assert!(markdown.contains("[[Feature showcase]]"));
        assert!(markdown.contains("https://example.com/blocked-demo.png"));
        assert!(markdown.contains("[^1]: Never silently transformed."));
    }
}
