use std::{
    fs,
    path::Path,
    sync::{Mutex, MutexGuard},
    time::Duration,
};

use rusqlite::{Connection, OpenFlags, OptionalExtension, backup::Backup, params};
use skriuw_domain::{
    HistoryHeader, NodeKind, OperationAck, SearchHit, WorkspaceArchive, WorkspaceOperationEnvelope,
    WorkspaceSnapshot,
};
use skriuw_storage::{
    Diagnostic, HistoryCache, HistoryMaterialization, HistoryQueue, ImportSummary, IntegrityReport,
    PendingHistoryRevision, StorageError, WorkspaceMaintenance, WorkspaceStorage,
};

mod backup;
mod error;
mod migration;
mod operations;
mod queries;
mod recovery;

#[cfg(test)]
mod tests;

use crate::backup::{normalize_backup, prepare_new_target, temporary_sibling, verify_database};
use crate::error::{backend, json_backend};
use crate::migration::{
    MIGRATIONS, checksum, read_migrations, upgrade_legacy_ledger, validate_migration_list,
    verify_migration,
};
use crate::operations::{
    apply_operations_in_transaction, enqueue_history, fts_query, replace_fts, replace_references,
    require_changed, require_worker, validate_operations,
};
use crate::queries::{
    read_archive, read_sidebar_expansion, read_snapshot, write_sidebar_expansion,
};

pub use recovery::{
    BackupRetentionPolicy, BackupRotationOutcome, RECOVERY_MANIFEST_VERSION, RecoveryArtifact,
    RecoveryManifest,
};

pub struct SqliteWorkspace {
    connection: Mutex<Connection>,
    recovery_gate: Mutex<()>,
}

impl SqliteWorkspace {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StorageError> {
        let mut connection = Connection::open(path).map_err(backend)?;
        Self::configure(&connection)?;
        Self::migrate(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            recovery_gate: Mutex::new(()),
        })
    }

    pub fn open_in_memory() -> Result<Self, StorageError> {
        let mut connection = Connection::open_in_memory().map_err(backend)?;
        Self::configure(&connection)?;
        Self::migrate(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            recovery_gate: Mutex::new(()),
        })
    }

    pub fn quick_check(&self) -> Result<String, StorageError> {
        self.lock()?
            .query_row("PRAGMA quick_check", [], |row| row.get(0))
            .map_err(backend)
    }

    pub fn verify_database_file(path: impl AsRef<Path>) -> Result<WorkspaceSnapshot, StorageError> {
        let connection = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(backend)?;
        verify_database(&connection)?;
        read_snapshot(&connection)
    }

    pub fn backup_to(&self, target: impl AsRef<Path>) -> Result<(), StorageError> {
        let target = target.as_ref();
        prepare_new_target(target)?;
        let temporary = temporary_sibling(target)?;
        let result = (|| {
            let mut destination = Connection::open(&temporary).map_err(backend)?;
            {
                let source = self.lock()?;
                let backup = Backup::new(&source, &mut destination).map_err(backend)?;
                backup
                    .run_to_completion(128, Duration::from_millis(2), None)
                    .map_err(backend)?;
            }
            normalize_backup(&destination)?;
            verify_database(&destination)?;
            drop(destination);
            fs::rename(&temporary, target).map_err(backend)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    pub fn restore_backup_to(
        backup_path: impl AsRef<Path>,
        target: impl AsRef<Path>,
    ) -> Result<(), StorageError> {
        let backup_path = backup_path.as_ref();
        let target = target.as_ref();
        prepare_new_target(target)?;
        let source = Connection::open_with_flags(
            backup_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(backend)?;
        verify_database(&source)?;
        let temporary = temporary_sibling(target)?;
        let result = (|| {
            let mut destination = Connection::open(&temporary).map_err(backend)?;
            {
                let backup = Backup::new(&source, &mut destination).map_err(backend)?;
                backup
                    .run_to_completion(128, Duration::from_millis(2), None)
                    .map_err(backend)?;
            }
            normalize_backup(&destination)?;
            verify_database(&destination)?;
            drop(destination);
            fs::rename(&temporary, target).map_err(backend)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    fn configure(connection: &Connection) -> Result<(), StorageError> {
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(backend)?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(backend)?;
        if !connection.is_autocommit() {
            return Err(StorageError::Backend(
                "database opened inside a transaction".into(),
            ));
        }
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(backend)?;
        connection
            .pragma_update(None, "synchronous", "NORMAL")
            .map_err(backend)?;
        Ok(())
    }

    fn migrate(connection: &mut Connection) -> Result<(), StorageError> {
        validate_migration_list()?;
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS schema_migrations (\
                     version INTEGER PRIMARY KEY,\
                     name TEXT NOT NULL,\
                     checksum TEXT NOT NULL,\
                     applied_at INTEGER NOT NULL\
                 ) STRICT;",
            )
            .map_err(backend)?;
        upgrade_legacy_ledger(connection)?;

        let applied = read_migrations(connection)?;
        for (version, record) in &applied {
            let Some(migration) = MIGRATIONS
                .iter()
                .find(|migration| migration.version == *version)
            else {
                return Err(StorageError::Backend(format!(
                    "database migration {version} is newer than this application"
                )));
            };
            verify_migration(migration, record)?;
        }

        for migration in MIGRATIONS {
            if applied.contains_key(&migration.version) {
                continue;
            }
            let transaction = connection.transaction().map_err(backend)?;
            transaction.execute_batch(migration.sql).map_err(backend)?;
            transaction
                .execute(
                    "INSERT INTO schema_migrations(version, name, checksum, applied_at) \
                     VALUES (?1, ?2, ?3, unixepoch('subsec') * 1000)",
                    params![migration.version, migration.name, checksum(migration.sql)],
                )
                .map_err(backend)?;
            transaction
                .pragma_update(None, "user_version", migration.version)
                .map_err(backend)?;
            transaction.commit().map_err(backend)?;
        }
        Ok(())
    }

    fn lock(&self) -> Result<MutexGuard<'_, Connection>, StorageError> {
        self.connection
            .lock()
            .map_err(|_| StorageError::Backend("SQLite connection lock poisoned".into()))
    }
}

impl WorkspaceStorage for SqliteWorkspace {
    fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
        let connection = self.lock()?;
        read_snapshot(&connection)
    }

    fn load_sidebar_expansion(&self) -> Result<Option<Vec<String>>, StorageError> {
        let connection = self.lock()?;
        read_sidebar_expansion(&connection)
    }

    fn save_sidebar_expansion(&self, folder_ids: &[String]) -> Result<(), StorageError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(backend)?;
        write_sidebar_expansion(&transaction, folder_ids)?;
        transaction.commit().map_err(backend)
    }

    fn apply_operations(
        &self,
        operations: &[WorkspaceOperationEnvelope],
    ) -> Result<OperationAck, StorageError> {
        validate_operations(operations)?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(backend)?;
        let acknowledgement = apply_operations_in_transaction(&transaction, operations)?;
        transaction.commit().map_err(backend)?;
        Ok(acknowledgement)
    }

    fn apply_operation_batches(
        &self,
        batches: &[Vec<WorkspaceOperationEnvelope>],
    ) -> Result<Vec<Result<OperationAck, StorageError>>, StorageError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(backend)?;
        let mut results = Vec::with_capacity(batches.len());
        for operations in batches {
            if let Err(error) = validate_operations(operations) {
                results.push(Err(error));
                continue;
            }
            transaction
                .execute_batch("SAVEPOINT operation_batch")
                .map_err(backend)?;
            match apply_operations_in_transaction(&transaction, operations) {
                Ok(acknowledgement) => {
                    transaction
                        .execute_batch("RELEASE operation_batch")
                        .map_err(backend)?;
                    results.push(Ok(acknowledgement));
                }
                Err(error) => {
                    transaction
                        .execute_batch("ROLLBACK TO operation_batch; RELEASE operation_batch")
                        .map_err(backend)?;
                    results.push(Err(error));
                }
            }
        }
        transaction.commit().map_err(backend)?;
        Ok(results)
    }

    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, StorageError> {
        let query = fts_query(query);
        if query.is_empty() || limit == 0 {
            return Ok(Vec::new());
        }

        let connection = self.lock()?;
        let mut statement = connection
            .prepare_cached(
                "SELECT documents_fts.note_id, documents_fts.title, \
                 snippet(documents_fts, 2, '<mark>', '</mark>', '…', 24), \
                 bm25(documents_fts) \
                 FROM documents_fts \
                 JOIN workspace_nodes ON workspace_nodes.id = documents_fts.note_id \
                 WHERE documents_fts MATCH ?1 \
                 AND NOT EXISTS (\
                     WITH RECURSIVE ancestors(id, parent_id, deleted_at) AS (\
                         SELECT id, parent_id, deleted_at FROM workspace_nodes \
                         WHERE id = documents_fts.note_id \
                         UNION ALL \
                         SELECT parent.id, parent.parent_id, parent.deleted_at \
                         FROM workspace_nodes parent \
                         JOIN ancestors ON parent.id = ancestors.parent_id\
                     ) \
                     SELECT 1 FROM ancestors WHERE deleted_at IS NOT NULL\
                 ) \
                 ORDER BY bm25(documents_fts) \
                 LIMIT ?2",
            )
            .map_err(backend)?;
        let rows = statement
            .query_map(params![query, limit as i64], |row| {
                Ok(SearchHit {
                    note_id: row.get(0)?,
                    title: row.get(1)?,
                    snippet: row.get(2)?,
                    score: row.get(3)?,
                })
            })
            .map_err(backend)?;

        rows.collect::<Result<Vec<_>, _>>().map_err(backend)
    }
}

impl WorkspaceMaintenance for SqliteWorkspace {
    fn export_archive(&self, exported_at: i64) -> Result<WorkspaceArchive, StorageError> {
        let connection = self.lock()?;
        let archive = read_archive(&connection, exported_at)?;
        archive
            .validate()
            .map_err(|error| StorageError::InvalidOperation(error.to_string()))?;
        Ok(archive)
    }

    fn replace_from_archive(
        &self,
        archive: &WorkspaceArchive,
    ) -> Result<ImportSummary, StorageError> {
        archive
            .validate()
            .map_err(|error| StorageError::InvalidOperation(error.to_string()))?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(backend)?;
        transaction
            .execute_batch(
                "DELETE FROM history_outbox;\
                 DELETE FROM history_cache;\
                 DELETE FROM documents_fts;\
                 DELETE FROM documents;\
                 DELETE FROM document_references;\
                 DELETE FROM note_images;\
                 DELETE FROM workspace_tags;\
                 DELETE FROM workspace_people;\
                 DELETE FROM workspace_nodes;\
                 DELETE FROM app_state;",
            )
            .map_err(backend)?;

        for node in &archive.nodes {
            transaction
                .execute(
                    "INSERT INTO workspace_nodes \
                     (id, kind, parent_id, rank, title, icon, created_at, updated_at, deleted_at) \
                     VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        node.id,
                        match node.kind {
                            NodeKind::Note => "note",
                            NodeKind::Folder => "folder",
                        },
                        node.rank,
                        node.title,
                        node.icon,
                        node.created_at,
                        node.updated_at,
                        node.deleted_at
                    ],
                )
                .map_err(backend)?;
        }
        for node in archive.nodes.iter().filter(|node| node.parent_id.is_some()) {
            transaction
                .execute(
                    "UPDATE workspace_nodes SET parent_id = ?2 WHERE id = ?1",
                    params![node.id, node.parent_id],
                )
                .map_err(backend)?;
        }

        for document in &archive.documents {
            transaction
                .execute(
                    "INSERT INTO documents \
                     (note_id, document_json, markdown, revision, word_count) \
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        document.note_id,
                        document.document_json.to_string(),
                        document.markdown,
                        document.revision,
                        document.word_count
                    ],
                )
                .map_err(backend)?;
            let title = archive
                .nodes
                .iter()
                .find(|node| node.id == document.note_id)
                .map(|node| node.title.as_str())
                .ok_or_else(|| StorageError::NotFound(document.note_id.clone()))?;
            replace_fts(&transaction, &document.note_id, title, &document.markdown)?;
            enqueue_history(
                &transaction,
                &document.note_id,
                document.revision,
                &document.markdown,
                archive
                    .nodes
                    .iter()
                    .find(|node| node.id == document.note_id)
                    .map(|node| node.updated_at)
                    .unwrap_or(archive.exported_at),
            )?;
        }

        for tag in &archive.tags {
            transaction
                .execute(
                    "INSERT INTO workspace_tags (id, name, color, created_at, updated_at, created_in) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        tag.id,
                        tag.name,
                        tag.color,
                        tag.created_at,
                        tag.updated_at,
                        tag.created_in
                    ],
                )
                .map_err(backend)?;
        }
        for person in &archive.people {
            transaction.execute("INSERT INTO workspace_people (id, name, initials, color, note, created_at, updated_at, created_in) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", params![person.id, person.name, person.initials, person.color, person.note, person.created_at, person.updated_at, person.created_in]).map_err(backend)?;
        }
        for document in &archive.documents {
            replace_references(&transaction, &document.note_id, &document.document_json)?;
        }

        transaction
            .execute(
                "INSERT INTO app_state(key, value_json) VALUES ('settings', ?1)",
                [serde_json::to_string(&archive.settings).map_err(json_backend)?],
            )
            .map_err(backend)?;
        if let Some(active_note_id) = &archive.active_note_id {
            transaction
                .execute(
                    "INSERT INTO app_state(key, value_json) VALUES ('active_note_id', ?1)",
                    [serde_json::to_string(&Some(active_note_id)).map_err(json_backend)?],
                )
                .map_err(backend)?;
        }

        transaction.commit().map_err(backend)?;
        Ok(ImportSummary {
            nodes: archive.nodes.len(),
            documents: archive.documents.len(),
            history_items: archive.documents.len(),
        })
    }

    fn integrity_check(&self) -> Result<IntegrityReport, StorageError> {
        let mut issues = {
            let connection = self.lock()?;
            let results = {
                let mut statement = connection
                    .prepare("PRAGMA integrity_check")
                    .map_err(backend)?;
                statement
                    .query_map([], |row| row.get::<_, String>(0))
                    .map_err(backend)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(backend)?
            };
            let violations = {
                let mut statement = connection
                    .prepare("PRAGMA foreign_key_check")
                    .map_err(backend)?;
                statement
                    .query_map([], |row| {
                        Ok(format!(
                            "foreign key violation in {} row {} referencing {}",
                            row.get::<_, String>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?
                        ))
                    })
                    .map_err(backend)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(backend)?
            };
            let mut issues = results
                .into_iter()
                .filter(|result| result != "ok")
                .collect::<Vec<_>>();
            issues.extend(violations);
            issues
        };
        if let Err(error) = WorkspaceArchive::v1(self.bootstrap()?, 0).validate() {
            issues.push(error.to_string());
        }
        Ok(IntegrityReport {
            healthy: issues.is_empty(),
            issues,
        })
    }
}

impl HistoryQueue for SqliteWorkspace {
    fn claim_history_revision(
        &self,
        worker_id: &str,
        now_ms: i64,
        lease_ms: i64,
    ) -> Result<Option<PendingHistoryRevision>, StorageError> {
        require_worker(worker_id)?;
        if now_ms < 0 || lease_ms <= 0 {
            return Err(StorageError::InvalidOperation(
                "history lease requires non-negative time and positive duration".into(),
            ));
        }
        let lease_expired_before = now_ms.saturating_sub(lease_ms);
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(backend)?;
        let item = transaction
            .query_row(
                "SELECT id, note_id, revision, markdown, created_at, attempts \
                 FROM history_outbox \
                 WHERE (claimed_at IS NULL OR claimed_at <= ?1) \
                 AND NOT EXISTS (\
                     WITH RECURSIVE ancestors(id, parent_id, deleted_at) AS (\
                         SELECT id, parent_id, deleted_at FROM workspace_nodes \
                         WHERE id = history_outbox.note_id \
                         UNION ALL \
                         SELECT parent.id, parent.parent_id, parent.deleted_at \
                         FROM workspace_nodes parent \
                         JOIN ancestors ON parent.id = ancestors.parent_id\
                     ) \
                     SELECT 1 FROM ancestors WHERE deleted_at IS NOT NULL\
                 ) \
                 ORDER BY created_at, id LIMIT 1",
                [lease_expired_before],
                |row| {
                    Ok(PendingHistoryRevision {
                        id: row.get(0)?,
                        note_id: row.get(1)?,
                        revision: row.get(2)?,
                        markdown: row.get(3)?,
                        created_at: row.get(4)?,
                        attempts: row.get::<_, i64>(5)? + 1,
                    })
                },
            )
            .optional()
            .map_err(backend)?;
        let Some(item) = item else {
            transaction.commit().map_err(backend)?;
            return Ok(None);
        };
        let changed = transaction
            .execute(
                "UPDATE history_outbox \
                 SET claimed_by = ?2, claimed_at = ?3, attempts = attempts + 1, last_error = NULL \
                 WHERE id = ?1",
                params![item.id, worker_id, now_ms],
            )
            .map_err(backend)?;
        require_changed(changed, &item.id)?;
        transaction.commit().map_err(backend)?;
        Ok(Some(item))
    }

    fn complete_history_revision(
        &self,
        worker_id: &str,
        item_id: &str,
        materialization: &HistoryMaterialization,
    ) -> Result<(), StorageError> {
        require_worker(worker_id)?;
        if materialization.version_id.trim().is_empty() {
            return Err(StorageError::InvalidOperation(
                "history version id cannot be empty".into(),
            ));
        }
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(backend)?;
        let item = transaction
            .query_row(
                "SELECT note_id, created_at FROM history_outbox \
                 WHERE id = ?1 AND claimed_by = ?2",
                params![item_id, worker_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()
            .map_err(backend)?
            .ok_or_else(|| StorageError::NotFound(item_id.into()))?;
        transaction
            .execute(
                "INSERT INTO history_cache(note_id, version_id, created_at, summary) \
                 VALUES (?1, ?2, ?3, ?4) \
                 ON CONFLICT(note_id, version_id) DO UPDATE SET \
                     created_at = excluded.created_at, summary = excluded.summary",
                params![
                    item.0,
                    materialization.version_id,
                    item.1,
                    materialization.summary
                ],
            )
            .map_err(backend)?;
        let changed = transaction
            .execute(
                "DELETE FROM history_outbox WHERE id = ?1 AND claimed_by = ?2",
                params![item_id, worker_id],
            )
            .map_err(backend)?;
        require_changed(changed, item_id)?;
        transaction.commit().map_err(backend)
    }

    fn release_history_revision(
        &self,
        worker_id: &str,
        item_id: &str,
        diagnostic: &Diagnostic,
    ) -> Result<(), StorageError> {
        require_worker(worker_id)?;
        let connection = self.lock()?;
        let diagnostic = diagnostic.to_string();
        let changed = connection
            .execute(
                "UPDATE history_outbox \
                 SET claimed_by = NULL, claimed_at = NULL, last_error = ?3 \
                 WHERE id = ?1 AND claimed_by = ?2",
                params![item_id, worker_id, diagnostic],
            )
            .map_err(backend)?;
        require_changed(changed, item_id)
    }
}

impl HistoryCache for SqliteWorkspace {
    fn replace_history_headers(&self, headers: &[HistoryHeader]) -> Result<usize, StorageError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(backend)?;
        transaction
            .execute("DELETE FROM history_cache", [])
            .map_err(backend)?;
        let mut inserted = 0;
        for header in headers {
            if header.note_id.trim().is_empty()
                || header.version_id.trim().is_empty()
                || header.created_at < 0
            {
                return Err(StorageError::InvalidOperation(
                    "invalid history cache header".into(),
                ));
            }
            inserted += transaction
                .execute(
                    "INSERT INTO history_cache(note_id, version_id, created_at, summary) \
                     SELECT ?1, ?2, ?3, ?4 \
                     WHERE EXISTS(SELECT 1 FROM workspace_nodes WHERE id = ?1) \
                     ON CONFLICT(note_id, version_id) DO UPDATE SET \
                         created_at = excluded.created_at, summary = excluded.summary",
                    params![
                        header.note_id,
                        header.version_id,
                        header.created_at,
                        header.summary
                    ],
                )
                .map_err(backend)?;
        }
        transaction.commit().map_err(backend)?;
        Ok(inserted)
    }
}
