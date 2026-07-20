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
use skriuw_sqlite::{BackupRetentionPolicy, BackupRotationOutcome, SqliteWorkspace};
use skriuw_storage::{
    Diagnostic, DiagnosticCategory, DiagnosticContext, WorkspaceMaintenance, WorkspaceStorage,
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
            storage.apply_operations(&[WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::CreateNote {
                    id: id.clone(),
                    title: "Welcome".into(),
                    placement: NodePlacement::last(None),
                    document_json: json!({
                        "type": "doc",
                        "content": [{
                            "type": "heading",
                            "attrs": {"level": 1},
                            "content": [{"type": "text", "text": "Welcome"}]
                        }]
                    }),
                    markdown: "# Welcome\n\nStandalone backend is ready.".into(),
                    at: now_ms()?,
                },
            )])?;
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
           backup <database> <backup>\n\
           backup-rotate <database> <recovery-directory>\n\
           backup-manifest <recovery-directory>\n\
           restore <backup> <new-database>\n\
           export <database> <archive.json>\n\
           import <database> <archive.json>"
    );
}
