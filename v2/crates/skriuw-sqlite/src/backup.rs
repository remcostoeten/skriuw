use std::{
    fs,
    path::{Path, PathBuf},
};

use rusqlite::Connection;
use skriuw_storage::StorageError;
use uuid::Uuid;

use crate::error::backend;
use crate::migration::{MIGRATIONS, read_migrations, verify_migration};
use crate::queries::read_archive;

pub(crate) fn prepare_new_target(target: &Path) -> Result<(), StorageError> {
    if fs::symlink_metadata(target).is_ok() {
        return Err(StorageError::AlreadyExists(target.display().to_string()));
    }
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(backend)
}

pub(crate) fn temporary_sibling(target: &Path) -> Result<PathBuf, StorageError> {
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let filename = target
        .file_name()
        .and_then(|filename| filename.to_str())
        .ok_or_else(|| StorageError::InvalidOperation("backup target has no filename".into()))?;
    Ok(parent.join(format!(".{filename}.{}.partial", Uuid::new_v4())))
}

pub(crate) fn verify_database(connection: &Connection) -> Result<(), StorageError> {
    let mut statement = connection
        .prepare("PRAGMA integrity_check")
        .map_err(backend)?;
    let integrity = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)?;
    if integrity.as_slice() != ["ok"] {
        return Err(StorageError::Backend(format!(
            "database integrity check failed: {}",
            integrity.join("; ")
        )));
    }
    drop(statement);
    let mut statement = connection
        .prepare("PRAGMA foreign_key_check")
        .map_err(backend)?;
    if statement.exists([]).map_err(backend)? {
        return Err(StorageError::Backend(
            "database foreign key check failed".into(),
        ));
    }
    drop(statement);
    let applied = read_migrations(connection)?;
    if applied.len() != MIGRATIONS.len() {
        return Err(StorageError::Backend(
            "database migration set is incomplete".into(),
        ));
    }
    for migration in MIGRATIONS {
        let record = applied.get(&migration.version).ok_or_else(|| {
            StorageError::Backend(format!(
                "database migration {} is missing",
                migration.version
            ))
        })?;
        verify_migration(migration, record)?;
    }
    read_archive(connection, 0)?
        .validate()
        .map_err(|error| StorageError::Backend(error.to_string()))
}

pub(crate) fn normalize_backup(connection: &Connection) -> Result<(), StorageError> {
    connection
        .pragma_update(None, "journal_mode", "DELETE")
        .map_err(backend)?;
    connection
        .pragma_update(None, "synchronous", "FULL")
        .map_err(backend)
}
