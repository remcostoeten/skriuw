use std::{
    env,
    error::Error,
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::json;
use skriuw_domain::{WorkspaceOperation, WorkspaceOperationEnvelope};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::WorkspaceStorage;
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
                    parent_id: None,
                    title: "Welcome".into(),
                    rank: 1024,
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

fn print_help() {
    println!(
        "skriuw-cli\n\n\
         commands:\n\
           init <database>\n\
           check <database>\n\
           snapshot <database>\n\
           seed <database>\n\
           search <database> <query>"
    );
}
