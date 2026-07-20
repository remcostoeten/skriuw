use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::Duration,
};

use rusqlite::{Connection, OpenFlags, OptionalExtension, Transaction, backup::Backup, params};
use sha2::{Digest, Sha256};
use skriuw_domain::{
    EntityRevision, HistoryHeader, NodeKind, NodePlacement, NodePosition, NodeRankChange,
    OperationAck, OperationValidationError, SearchHit, WORKSPACE_PROTOCOL_VERSION,
    WorkspaceArchive, WorkspaceDocument, WorkspaceNode, WorkspaceOperation,
    WorkspaceOperationEnvelope, WorkspaceSettings, WorkspaceSnapshot,
};
use skriuw_storage::{
    Diagnostic, HistoryCache, HistoryMaterialization, HistoryQueue, ImportSummary, IntegrityReport,
    PendingHistoryRevision, StorageError, WorkspaceMaintenance, WorkspaceStorage,
};
use uuid::Uuid;

mod recovery;

pub use recovery::{
    BackupRetentionPolicy, BackupRotationOutcome, RECOVERY_MANIFEST_VERSION, RecoveryArtifact,
    RecoveryManifest,
};

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial",
        sql: include_str!("../../../migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        name: "settings_document",
        sql: include_str!("../../../migrations/0002_settings_document.sql"),
    },
];
const NODE_RANK_GAP: i64 = 1024;

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

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

struct AppliedMigration {
    name: String,
    checksum: String,
}

fn validate_migration_list() -> Result<(), StorageError> {
    for (index, migration) in MIGRATIONS.iter().enumerate() {
        let expected = index as i64 + 1;
        if migration.version != expected || migration.name.trim().is_empty() {
            return Err(StorageError::Backend(format!(
                "invalid embedded migration at position {expected}"
            )));
        }
    }
    Ok(())
}

fn upgrade_legacy_ledger(connection: &mut Connection) -> Result<(), StorageError> {
    let columns = table_columns(connection, "schema_migrations")?;
    if columns.iter().any(|column| column == "checksum") {
        return Ok(());
    }
    let legacy = connection
        .query_row(
            "SELECT version, name, applied_at FROM schema_migrations",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        )
        .optional()
        .map_err(backend)?;
    let Some((1, name, applied_at)) = legacy else {
        return Err(StorageError::Backend(
            "unsupported legacy migration ledger".into(),
        ));
    };
    if name != "initial"
        || !table_columns(connection, "history_cache")?
            .iter()
            .any(|column| column == "commit_id")
        || table_columns(connection, "git_outbox")?.is_empty()
    {
        return Err(StorageError::Backend(
            "unsupported legacy pre-release database shape".into(),
        ));
    }

    let transaction = connection.transaction().map_err(backend)?;
    transaction
        .execute_batch(
            "ALTER TABLE history_cache RENAME COLUMN commit_id TO version_id;\
             ALTER TABLE git_outbox RENAME TO history_outbox;\
             DROP INDEX git_outbox_created;\
             ALTER TABLE history_outbox ADD COLUMN claimed_by TEXT;\
             ALTER TABLE history_outbox ADD COLUMN claimed_at INTEGER;\
             ALTER TABLE history_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0 \
                 CHECK (attempts >= 0);\
             ALTER TABLE history_outbox ADD COLUMN last_error TEXT;\
             CREATE INDEX history_outbox_claim \
                 ON history_outbox(claimed_at, created_at, id);\
             ALTER TABLE schema_migrations RENAME TO schema_migrations_legacy;\
             CREATE TABLE schema_migrations (\
                 version INTEGER PRIMARY KEY,\
                 name TEXT NOT NULL,\
                 checksum TEXT NOT NULL,\
                 applied_at INTEGER NOT NULL\
             ) STRICT;",
        )
        .map_err(backend)?;
    transaction
        .execute(
            "INSERT INTO schema_migrations(version, name, checksum, applied_at) \
             VALUES (1, 'initial', ?1, ?2)",
            params![checksum(MIGRATIONS[0].sql), applied_at],
        )
        .map_err(backend)?;
    transaction
        .execute("DROP TABLE schema_migrations_legacy", [])
        .map_err(backend)?;
    transaction
        .pragma_update(None, "user_version", 1)
        .map_err(backend)?;
    transaction.commit().map_err(backend)
}

fn table_columns(connection: &Connection, table: &str) -> Result<Vec<String>, StorageError> {
    if !table
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(StorageError::Backend("invalid table identifier".into()));
    }
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(backend)?;
    statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)
}

fn read_migrations(
    connection: &Connection,
) -> Result<BTreeMap<i64, AppliedMigration>, StorageError> {
    let mut statement = connection
        .prepare("SELECT version, name, checksum FROM schema_migrations ORDER BY version")
        .map_err(backend)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                AppliedMigration {
                    name: row.get(1)?,
                    checksum: row.get(2)?,
                },
            ))
        })
        .map_err(backend)?;
    rows.collect::<Result<BTreeMap<_, _>, _>>().map_err(backend)
}

fn verify_migration(migration: &Migration, applied: &AppliedMigration) -> Result<(), StorageError> {
    if applied.name != migration.name {
        return Err(StorageError::Backend(format!(
            "migration {} name drift: database has {}, application has {}",
            migration.version, applied.name, migration.name
        )));
    }
    let expected = checksum(migration.sql);
    if applied.checksum != expected {
        return Err(StorageError::Backend(format!(
            "migration {} checksum drift",
            migration.version
        )));
    }
    Ok(())
}

fn checksum(sql: &str) -> String {
    format!("{:x}", Sha256::digest(sql.as_bytes()))
}

impl WorkspaceStorage for SqliteWorkspace {
    fn bootstrap(&self) -> Result<WorkspaceSnapshot, StorageError> {
        let connection = self.lock()?;
        let nodes = read_nodes(&connection)?;
        let documents = read_documents(&connection)?;
        let history_headers = read_history_headers(&connection)?;
        let settings = read_settings(&connection)?;
        let active_note_id = read_active_note(&connection)?;

        Ok(WorkspaceSnapshot {
            protocol_version: WORKSPACE_PROTOCOL_VERSION,
            active_note_id,
            nodes,
            documents,
            history_headers,
            settings,
        })
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

fn validate_operations(operations: &[WorkspaceOperationEnvelope]) -> Result<(), StorageError> {
    for envelope in operations {
        envelope.validate().map_err(validation)?;
    }
    Ok(())
}

fn apply_operations_in_transaction(
    transaction: &Transaction<'_>,
    operations: &[WorkspaceOperationEnvelope],
) -> Result<OperationAck, StorageError> {
    let mut revisions = Vec::new();
    let mut rank_changes = BTreeMap::new();
    for envelope in operations {
        apply_operation(
            transaction,
            &envelope.operation,
            &mut revisions,
            &mut rank_changes,
        )?;
    }
    Ok(OperationAck {
        applied: operations.len(),
        revisions,
        rank_changes: rank_changes.into_values().collect(),
    })
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

fn apply_operation(
    transaction: &Transaction<'_>,
    operation: &WorkspaceOperation,
    revisions: &mut Vec<EntityRevision>,
    rank_changes: &mut BTreeMap<String, NodeRankChange>,
) -> Result<(), StorageError> {
    match operation {
        WorkspaceOperation::CreateFolder {
            id,
            title,
            placement,
            at,
        } => {
            require_parent_folder(transaction, placement.parent_id.as_deref())?;
            let rank = allocate_rank(transaction, id, placement, rank_changes)?;
            transaction
                .execute(
                    "INSERT INTO workspace_nodes \
                     (id, kind, parent_id, rank, title, created_at, updated_at) \
                     VALUES (?1, 'folder', ?2, ?3, ?4, ?5, ?5)",
                    params![id, placement.parent_id, rank, title, at],
                )
                .map_err(backend)?;
            record_rank_change(rank_changes, id, &placement.parent_id, rank);
        }
        WorkspaceOperation::CreateNote {
            id,
            title,
            placement,
            document_json,
            markdown,
            at,
        } => {
            require_parent_folder(transaction, placement.parent_id.as_deref())?;
            let rank = allocate_rank(transaction, id, placement, rank_changes)?;
            transaction
                .execute(
                    "INSERT INTO workspace_nodes \
                     (id, kind, parent_id, rank, title, created_at, updated_at) \
                     VALUES (?1, 'note', ?2, ?3, ?4, ?5, ?5)",
                    params![id, placement.parent_id, rank, title, at],
                )
                .map_err(backend)?;
            transaction
                .execute(
                    "INSERT INTO documents \
                     (note_id, document_json, markdown, revision, word_count) \
                     VALUES (?1, ?2, ?3, 1, ?4)",
                    params![
                        id,
                        document_json.to_string(),
                        markdown,
                        count_words(markdown)
                    ],
                )
                .map_err(backend)?;
            replace_fts(transaction, id, title, markdown)?;
            enqueue_history(transaction, id, 1, markdown, *at)?;
            revisions.push(EntityRevision {
                id: id.clone(),
                revision: 1,
            });
            record_rank_change(rank_changes, id, &placement.parent_id, rank);
        }
        WorkspaceOperation::RenameNode { id, title, at } => {
            require_available_node(transaction, id)?;
            let changed = transaction
                .execute(
                    "UPDATE workspace_nodes SET title = ?2, updated_at = ?3 WHERE id = ?1",
                    params![id, title, at],
                )
                .map_err(backend)?;
            require_changed(changed, id)?;
            transaction
                .execute(
                    "UPDATE documents_fts SET title = ?2 WHERE note_id = ?1",
                    params![id, title],
                )
                .map_err(backend)?;
        }
        WorkspaceOperation::MoveNode { id, placement, at } => {
            require_available_node(transaction, id)?;
            require_parent_folder(transaction, placement.parent_id.as_deref())?;
            require_acyclic_parent(transaction, id, placement.parent_id.as_deref())?;
            let rank = allocate_rank(transaction, id, placement, rank_changes)?;
            let changed = transaction
                .execute(
                    "UPDATE workspace_nodes \
                     SET parent_id = ?2, rank = ?3, updated_at = ?4 \
                     WHERE id = ?1",
                    params![id, placement.parent_id, rank, at],
                )
                .map_err(backend)?;
            require_changed(changed, id)?;
            record_rank_change(rank_changes, id, &placement.parent_id, rank);
        }
        WorkspaceOperation::SaveDocument {
            note_id,
            document_json,
            markdown,
            word_count,
            expected_revision,
            at,
        } => {
            require_note(transaction, note_id)?;
            let next_revision = expected_revision.saturating_add(1);
            let changed = transaction
                .execute(
                    "UPDATE documents \
                     SET document_json = ?2, markdown = ?3, revision = ?4, word_count = ?5 \
                     WHERE note_id = ?1 AND revision = ?6",
                    params![
                        note_id,
                        document_json.to_string(),
                        markdown,
                        next_revision,
                        word_count,
                        expected_revision
                    ],
                )
                .map_err(backend)?;
            if changed == 0 {
                let current = current_revision(transaction, note_id)?;
                return Err(StorageError::RevisionConflict {
                    id: note_id.clone(),
                    expected: *expected_revision,
                    current,
                });
            }
            transaction
                .execute(
                    "UPDATE workspace_nodes SET updated_at = ?2 WHERE id = ?1",
                    params![note_id, at],
                )
                .map_err(backend)?;
            let title = node_title(transaction, note_id)?;
            replace_fts(transaction, note_id, &title, markdown)?;
            enqueue_history(transaction, note_id, next_revision, markdown, *at)?;
            revisions.push(EntityRevision {
                id: note_id.clone(),
                revision: next_revision,
            });
        }
        WorkspaceOperation::TrashSubtree { root_id, at } => {
            require_available_node(transaction, root_id)?;
            clear_active_note_in_subtree(transaction, root_id)?;
            let changed = transaction
                .execute(
                    "UPDATE workspace_nodes SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
                    params![root_id, at],
                )
                .map_err(backend)?;
            require_changed(changed, root_id)?;
        }
        WorkspaceOperation::RestoreSubtree {
            root_id,
            placement,
            at,
        } => {
            require_directly_trashed(transaction, root_id)?;
            require_parent_folder(transaction, placement.parent_id.as_deref())?;
            require_acyclic_parent(transaction, root_id, placement.parent_id.as_deref())?;
            let rank = allocate_rank(transaction, root_id, placement, rank_changes)?;
            let changed = transaction
                .execute(
                    "UPDATE workspace_nodes \
                     SET deleted_at = NULL, parent_id = ?2, rank = ?3, updated_at = ?4 \
                     WHERE id = ?1",
                    params![root_id, placement.parent_id, rank, at],
                )
                .map_err(backend)?;
            require_changed(changed, root_id)?;
            record_rank_change(rank_changes, root_id, &placement.parent_id, rank);
        }
        WorkspaceOperation::PurgeSubtree {
            root_id,
            trashed_before,
        } => {
            require_directly_trashed(transaction, root_id)?;
            let newest_trash = transaction
                .query_row(
                    "WITH RECURSIVE subtree(id) AS (\
                         SELECT id FROM workspace_nodes WHERE id = ?1 \
                         UNION ALL \
                         SELECT child.id FROM workspace_nodes child \
                         JOIN subtree parent ON child.parent_id = parent.id\
                     ) \
                     SELECT MAX(deleted_at) FROM workspace_nodes \
                     WHERE id IN (SELECT id FROM subtree)",
                    [root_id],
                    |row| row.get::<_, Option<i64>>(0),
                )
                .map_err(backend)?
                .ok_or_else(|| StorageError::NotFound(root_id.clone()))?;
            if newest_trash > *trashed_before {
                return Err(StorageError::InvalidOperation(format!(
                    "subtree {root_id} contains trash newer than retention cutoff {trashed_before}"
                )));
            }
            clear_active_note_in_subtree(transaction, root_id)?;
            transaction
                .execute(
                    "WITH RECURSIVE subtree(id) AS (\
                         SELECT id FROM workspace_nodes WHERE id = ?1 \
                         UNION ALL \
                         SELECT child.id FROM workspace_nodes child \
                         JOIN subtree parent ON child.parent_id = parent.id\
                     ) \
                     DELETE FROM documents_fts WHERE note_id IN (SELECT id FROM subtree)",
                    [root_id],
                )
                .map_err(backend)?;
            let changed = transaction
                .execute(
                    "WITH RECURSIVE subtree(id) AS (\
                         SELECT id FROM workspace_nodes WHERE id = ?1 \
                         UNION ALL \
                         SELECT child.id FROM workspace_nodes child \
                         JOIN subtree parent ON child.parent_id = parent.id\
                     ) \
                     DELETE FROM workspace_nodes WHERE id IN (SELECT id FROM subtree)",
                    [root_id],
                )
                .map_err(backend)?;
            require_changed(changed, root_id)?;
        }
        WorkspaceOperation::SetActiveNote { note_id } => {
            if let Some(id) = note_id {
                require_note(transaction, id)?;
            }
            transaction
                .execute(
                    "INSERT INTO app_state(key, value_json) VALUES ('active_note_id', ?1) \
                     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
                    [serde_json::to_string(note_id).map_err(json_backend)?],
                )
                .map_err(backend)?;
        }
        WorkspaceOperation::UpdateSettings { settings } => {
            transaction
                .execute(
                    "INSERT INTO app_state(key, value_json) VALUES ('settings', ?1) \
                     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
                    [serde_json::to_string(settings).map_err(json_backend)?],
                )
                .map_err(backend)?;
        }
    }
    Ok(())
}

fn read_nodes(connection: &Connection) -> Result<Vec<WorkspaceNode>, StorageError> {
    let mut statement = connection
        .prepare_cached(
            "SELECT id, kind, parent_id, rank, title, icon, created_at, updated_at, deleted_at \
             FROM workspace_nodes ORDER BY parent_id, rank, id",
        )
        .map_err(backend)?;
    let rows = statement
        .query_map([], |row| {
            let kind = match row.get::<_, String>(1)?.as_str() {
                "note" => NodeKind::Note,
                "folder" => NodeKind::Folder,
                other => {
                    return Err(rusqlite::Error::FromSqlConversionFailure(
                        1,
                        rusqlite::types::Type::Text,
                        format!("unknown node kind {other}").into(),
                    ));
                }
            };
            Ok(WorkspaceNode {
                id: row.get(0)?,
                kind,
                parent_id: row.get(2)?,
                rank: row.get(3)?,
                title: row.get(4)?,
                icon: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                deleted_at: row.get(8)?,
            })
        })
        .map_err(backend)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(backend)
}

fn read_documents(connection: &Connection) -> Result<Vec<WorkspaceDocument>, StorageError> {
    let mut statement = connection
        .prepare_cached(
            "SELECT note_id, document_json, markdown, revision, word_count \
             FROM documents ORDER BY note_id",
        )
        .map_err(backend)?;
    let rows = statement
        .query_map([], |row| {
            let raw = row.get::<_, String>(1)?;
            let document_json = serde_json::from_str(&raw).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    1,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(WorkspaceDocument {
                note_id: row.get(0)?,
                document_json,
                markdown: row.get(2)?,
                revision: row.get(3)?,
                word_count: row.get(4)?,
            })
        })
        .map_err(backend)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(backend)
}

fn read_history_headers(connection: &Connection) -> Result<Vec<HistoryHeader>, StorageError> {
    let mut statement = connection
        .prepare_cached(
            "SELECT history_cache.note_id, version_id, created_at, summary \
             FROM history_cache \
             WHERE NOT EXISTS (\
                 WITH RECURSIVE ancestors(id, parent_id, deleted_at) AS (\
                     SELECT id, parent_id, deleted_at FROM workspace_nodes \
                     WHERE id = history_cache.note_id \
                     UNION ALL \
                     SELECT parent.id, parent.parent_id, parent.deleted_at \
                     FROM workspace_nodes parent \
                     JOIN ancestors ON parent.id = ancestors.parent_id\
                 ) \
                 SELECT 1 FROM ancestors WHERE deleted_at IS NOT NULL\
             ) \
             ORDER BY history_cache.note_id, created_at DESC",
        )
        .map_err(backend)?;
    let rows = statement
        .query_map([], |row| {
            Ok(HistoryHeader {
                note_id: row.get(0)?,
                version_id: row.get(1)?,
                created_at: row.get(2)?,
                summary: row.get(3)?,
            })
        })
        .map_err(backend)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(backend)
}

fn read_settings(connection: &Connection) -> Result<WorkspaceSettings, StorageError> {
    let raw = connection
        .query_row(
            "SELECT value_json FROM app_state WHERE key = 'settings'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)?;
    let settings = match raw {
        Some(raw) => serde_json::from_str::<WorkspaceSettings>(&raw).map_err(json_backend)?,
        None => WorkspaceSettings::default(),
    };
    settings.validate().map_err(validation)?;
    Ok(settings)
}

fn read_active_note(connection: &Connection) -> Result<Option<String>, StorageError> {
    let active_note_id = read_stored_active_note(connection)?;
    match active_note_id {
        Some(note_id)
            if node_is_available(connection, &note_id)?
                && node_kind(connection, &note_id)?.as_deref() == Some("note") =>
        {
            Ok(Some(note_id))
        }
        _ => Ok(None),
    }
}

fn read_stored_active_note(connection: &Connection) -> Result<Option<String>, StorageError> {
    connection
        .query_row(
            "SELECT value_json FROM app_state WHERE key = 'active_note_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)?
        .map(|raw| serde_json::from_str::<Option<String>>(&raw).map_err(json_backend))
        .transpose()
        .map(Option::flatten)
}

fn read_archive(
    connection: &Connection,
    exported_at: i64,
) -> Result<WorkspaceArchive, StorageError> {
    Ok(WorkspaceArchive {
        archive_version: skriuw_domain::WORKSPACE_ARCHIVE_VERSION,
        protocol_version: WORKSPACE_PROTOCOL_VERSION,
        exported_at,
        active_note_id: read_active_note(connection)?,
        nodes: read_nodes(connection)?,
        documents: read_documents(connection)?,
        settings: read_settings(connection)?,
    })
}

fn prepare_new_target(target: &Path) -> Result<(), StorageError> {
    if fs::symlink_metadata(target).is_ok() {
        return Err(StorageError::AlreadyExists(target.display().to_string()));
    }
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(backend)
}

fn temporary_sibling(target: &Path) -> Result<PathBuf, StorageError> {
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

fn verify_database(connection: &Connection) -> Result<(), StorageError> {
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

fn normalize_backup(connection: &Connection) -> Result<(), StorageError> {
    connection
        .pragma_update(None, "journal_mode", "DELETE")
        .map_err(backend)?;
    connection
        .pragma_update(None, "synchronous", "FULL")
        .map_err(backend)
}

struct RankedSibling {
    id: String,
    rank: i64,
}

fn allocate_rank(
    transaction: &Transaction<'_>,
    node_id: &str,
    placement: &NodePlacement,
    rank_changes: &mut BTreeMap<String, NodeRankChange>,
) -> Result<i64, StorageError> {
    let (left, right) = placement_neighbors(transaction, node_id, placement)?;
    if let Some(rank) = rank_between(left, right) {
        return Ok(rank);
    }

    let siblings = load_active_siblings(transaction, node_id, &placement.parent_id)?;
    let insertion_index = match &placement.position {
        NodePosition::First => 0,
        NodePosition::Last => siblings.len(),
        NodePosition::Before { anchor_id } => siblings
            .iter()
            .position(|sibling| sibling.id == *anchor_id)
            .ok_or_else(|| StorageError::NotFound(anchor_id.clone()))?,
        NodePosition::After { anchor_id } => {
            siblings
                .iter()
                .position(|sibling| sibling.id == *anchor_id)
                .ok_or_else(|| StorageError::NotFound(anchor_id.clone()))?
                + 1
        }
    };

    let mut target_rank = None;
    for final_index in 0..=siblings.len() {
        let rank = i64::try_from(final_index + 1)
            .ok()
            .and_then(|position| position.checked_mul(NODE_RANK_GAP))
            .ok_or_else(|| StorageError::InvalidOperation("sibling rank range exhausted".into()))?;
        if final_index == insertion_index {
            target_rank = Some(rank);
            continue;
        }
        let sibling_index = if final_index < insertion_index {
            final_index
        } else {
            final_index - 1
        };
        let sibling = &siblings[sibling_index];
        if sibling.rank == rank {
            continue;
        }
        transaction
            .execute(
                "UPDATE workspace_nodes SET rank = ?2 WHERE id = ?1",
                params![sibling.id, rank],
            )
            .map_err(backend)?;
        record_rank_change(rank_changes, &sibling.id, &placement.parent_id, rank);
    }
    target_rank
        .ok_or_else(|| StorageError::InvalidOperation("node placement could not be ranked".into()))
}

fn placement_neighbors(
    transaction: &Transaction<'_>,
    node_id: &str,
    placement: &NodePlacement,
) -> Result<(Option<i64>, Option<i64>), StorageError> {
    match &placement.position {
        NodePosition::First => {
            let right = transaction
                .query_row(
                    "SELECT rank FROM workspace_nodes \
                     WHERE parent_id IS ?1 AND deleted_at IS NULL AND id <> ?2 \
                     ORDER BY rank, id LIMIT 1",
                    params![placement.parent_id, node_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(backend)?;
            Ok((None, right))
        }
        NodePosition::Last => {
            let left = transaction
                .query_row(
                    "SELECT rank FROM workspace_nodes \
                     WHERE parent_id IS ?1 AND deleted_at IS NULL AND id <> ?2 \
                     ORDER BY rank DESC, id DESC LIMIT 1",
                    params![placement.parent_id, node_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(backend)?;
            Ok((left, None))
        }
        NodePosition::Before { anchor_id } => {
            let anchor = require_placement_anchor(transaction, placement, anchor_id)?;
            let left = transaction
                .query_row(
                    "SELECT rank FROM workspace_nodes \
                     WHERE parent_id IS ?1 AND deleted_at IS NULL AND id <> ?2 \
                     AND (rank < ?3 OR (rank = ?3 AND id < ?4)) \
                     ORDER BY rank DESC, id DESC LIMIT 1",
                    params![placement.parent_id, node_id, anchor.rank, anchor.id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(backend)?;
            Ok((left, Some(anchor.rank)))
        }
        NodePosition::After { anchor_id } => {
            let anchor = require_placement_anchor(transaction, placement, anchor_id)?;
            let right = transaction
                .query_row(
                    "SELECT rank FROM workspace_nodes \
                     WHERE parent_id IS ?1 AND deleted_at IS NULL AND id <> ?2 \
                     AND (rank > ?3 OR (rank = ?3 AND id > ?4)) \
                     ORDER BY rank, id LIMIT 1",
                    params![placement.parent_id, node_id, anchor.rank, anchor.id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(backend)?;
            Ok((Some(anchor.rank), right))
        }
    }
}

fn require_placement_anchor(
    transaction: &Transaction<'_>,
    placement: &NodePlacement,
    anchor_id: &str,
) -> Result<RankedSibling, StorageError> {
    require_available_node(transaction, anchor_id)?;
    let (parent_id, rank) = transaction
        .query_row(
            "SELECT parent_id, rank FROM workspace_nodes WHERE id = ?1",
            [anchor_id],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, i64>(1)?)),
        )
        .map_err(backend)?;
    if parent_id != placement.parent_id {
        return Err(StorageError::InvalidOperation(format!(
            "anchor {anchor_id} is not a child of the requested parent"
        )));
    }
    Ok(RankedSibling {
        id: anchor_id.into(),
        rank,
    })
}

fn load_active_siblings(
    transaction: &Transaction<'_>,
    node_id: &str,
    parent_id: &Option<String>,
) -> Result<Vec<RankedSibling>, StorageError> {
    let mut statement = transaction
        .prepare_cached(
            "SELECT id, rank FROM workspace_nodes \
             WHERE parent_id IS ?1 AND deleted_at IS NULL AND id <> ?2 \
             ORDER BY rank, id",
        )
        .map_err(backend)?;
    statement
        .query_map(params![parent_id, node_id], |row| {
            Ok(RankedSibling {
                id: row.get(0)?,
                rank: row.get(1)?,
            })
        })
        .map_err(backend)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(backend)
}

fn rank_between(left: Option<i64>, right: Option<i64>) -> Option<i64> {
    match (left, right) {
        (None, None) => Some(NODE_RANK_GAP),
        (None, Some(right)) => right.checked_sub(NODE_RANK_GAP),
        (Some(left), None) => left.checked_add(NODE_RANK_GAP),
        (Some(left), Some(right)) => {
            let distance = i128::from(right) - i128::from(left);
            (distance > 1).then(|| {
                i64::try_from(i128::from(left) + distance / 2)
                    .expect("midpoint of two i64 ranks must fit i64")
            })
        }
    }
}

fn record_rank_change(
    rank_changes: &mut BTreeMap<String, NodeRankChange>,
    id: &str,
    parent_id: &Option<String>,
    rank: i64,
) {
    rank_changes.insert(
        id.into(),
        NodeRankChange {
            id: id.into(),
            parent_id: parent_id.clone(),
            rank,
        },
    );
}

fn require_parent_folder(
    transaction: &Transaction<'_>,
    parent_id: Option<&str>,
) -> Result<(), StorageError> {
    let Some(parent_id) = parent_id else {
        return Ok(());
    };
    let kind = transaction
        .query_row(
            "SELECT kind FROM workspace_nodes WHERE id = ?1",
            [parent_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)?;
    match kind.as_deref() {
        Some("folder") if node_is_available(transaction, parent_id)? => Ok(()),
        Some("folder") => Err(StorageError::InvalidOperation(format!(
            "parent {parent_id} is unavailable"
        ))),
        Some(_) => Err(StorageError::InvalidOperation(format!(
            "parent {parent_id} is not a folder"
        ))),
        None => Err(StorageError::NotFound(parent_id.into())),
    }
}

fn require_acyclic_parent(
    transaction: &Transaction<'_>,
    id: &str,
    parent_id: Option<&str>,
) -> Result<(), StorageError> {
    let Some(parent_id) = parent_id else {
        return Ok(());
    };
    let creates_cycle = transaction
        .query_row(
            "WITH RECURSIVE descendants(id) AS (\
                 SELECT id FROM workspace_nodes WHERE parent_id = ?1 \
                 UNION ALL \
                 SELECT child.id FROM workspace_nodes child \
                 JOIN descendants parent ON child.parent_id = parent.id\
             ) \
             SELECT EXISTS(SELECT 1 FROM descendants WHERE id = ?2)",
            params![id, parent_id],
            |row| row.get::<_, bool>(0),
        )
        .map_err(backend)?;
    if creates_cycle {
        return Err(StorageError::InvalidOperation(format!(
            "moving {id} below {parent_id} would create a cycle"
        )));
    }
    Ok(())
}

fn require_note(transaction: &Transaction<'_>, id: &str) -> Result<(), StorageError> {
    match require_available_node(transaction, id)?.as_str() {
        "note" => Ok(()),
        _ => Err(StorageError::InvalidOperation(format!(
            "active entity {id} is not a note"
        ))),
    }
}

fn require_available_node(transaction: &Transaction<'_>, id: &str) -> Result<String, StorageError> {
    let kind = transaction
        .query_row(
            "SELECT kind FROM workspace_nodes WHERE id = ?1",
            [id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(backend)?;
    let kind = kind.ok_or_else(|| StorageError::NotFound(id.into()))?;
    if !node_is_available(transaction, id)? {
        return Err(StorageError::InvalidOperation(format!(
            "node {id} is unavailable"
        )));
    }
    Ok(kind)
}

fn node_is_available(connection: &Connection, id: &str) -> Result<bool, StorageError> {
    connection
        .query_row(
            "WITH RECURSIVE ancestors(id, parent_id, deleted_at) AS (\
                 SELECT id, parent_id, deleted_at FROM workspace_nodes WHERE id = ?1 \
                 UNION ALL \
                 SELECT parent.id, parent.parent_id, parent.deleted_at \
                 FROM workspace_nodes parent \
                 JOIN ancestors ON parent.id = ancestors.parent_id\
             ) \
             SELECT COUNT(*) > 0 AND COALESCE(MAX(deleted_at IS NOT NULL), 0) = 0 \
             FROM ancestors",
            [id],
            |row| row.get(0),
        )
        .map_err(backend)
}

fn node_kind(connection: &Connection, id: &str) -> Result<Option<String>, StorageError> {
    connection
        .query_row(
            "SELECT kind FROM workspace_nodes WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(backend)
}

fn require_directly_trashed(transaction: &Transaction<'_>, id: &str) -> Result<i64, StorageError> {
    transaction
        .query_row(
            "SELECT deleted_at FROM workspace_nodes WHERE id = ?1",
            [id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(backend)?
        .ok_or_else(|| StorageError::NotFound(id.into()))?
        .ok_or_else(|| StorageError::InvalidOperation(format!("node {id} is not trashed")))
}

fn subtree_contains(
    connection: &Connection,
    root_id: &str,
    node_id: &str,
) -> Result<bool, StorageError> {
    connection
        .query_row(
            "WITH RECURSIVE subtree(id) AS (\
                 SELECT id FROM workspace_nodes WHERE id = ?1 \
                 UNION ALL \
                 SELECT child.id FROM workspace_nodes child \
                 JOIN subtree parent ON child.parent_id = parent.id\
             ) \
             SELECT EXISTS(SELECT 1 FROM subtree WHERE id = ?2)",
            params![root_id, node_id],
            |row| row.get(0),
        )
        .map_err(backend)
}

fn clear_active_note_in_subtree(
    transaction: &Transaction<'_>,
    root_id: &str,
) -> Result<(), StorageError> {
    let Some(active_note_id) = read_stored_active_note(transaction)? else {
        return Ok(());
    };
    if subtree_contains(transaction, root_id, &active_note_id)? {
        transaction
            .execute("DELETE FROM app_state WHERE key = 'active_note_id'", [])
            .map_err(backend)?;
    }
    Ok(())
}

fn require_changed(changed: usize, id: &str) -> Result<(), StorageError> {
    if changed == 0 {
        Err(StorageError::NotFound(id.into()))
    } else {
        Ok(())
    }
}

fn require_worker(worker_id: &str) -> Result<(), StorageError> {
    if worker_id.trim().is_empty() || worker_id.len() > 128 {
        Err(StorageError::InvalidOperation(
            "history worker id must contain 1 to 128 bytes".into(),
        ))
    } else {
        Ok(())
    }
}

fn current_revision(transaction: &Transaction<'_>, id: &str) -> Result<i64, StorageError> {
    transaction
        .query_row(
            "SELECT revision FROM documents WHERE note_id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(backend)?
        .ok_or_else(|| StorageError::NotFound(id.into()))
}

fn node_title(transaction: &Transaction<'_>, id: &str) -> Result<String, StorageError> {
    transaction
        .query_row(
            "SELECT title FROM workspace_nodes WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(backend)?
        .ok_or_else(|| StorageError::NotFound(id.into()))
}

fn replace_fts(
    transaction: &Transaction<'_>,
    note_id: &str,
    title: &str,
    markdown: &str,
) -> Result<(), StorageError> {
    transaction
        .execute("DELETE FROM documents_fts WHERE note_id = ?1", [note_id])
        .map_err(backend)?;
    transaction
        .execute(
            "INSERT INTO documents_fts(note_id, title, markdown) VALUES (?1, ?2, ?3)",
            params![note_id, title, markdown],
        )
        .map_err(backend)?;
    Ok(())
}

fn enqueue_history(
    transaction: &Transaction<'_>,
    note_id: &str,
    revision: i64,
    markdown: &str,
    created_at: i64,
) -> Result<(), StorageError> {
    transaction
        .execute(
            "INSERT INTO history_outbox(id, note_id, revision, markdown, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                Uuid::new_v4().to_string(),
                note_id,
                revision,
                markdown,
                created_at
            ],
        )
        .map_err(backend)?;
    Ok(())
}

fn count_words(markdown: &str) -> i64 {
    markdown
        .split_whitespace()
        .filter(|token| token.chars().any(char::is_alphanumeric))
        .count() as i64
}

fn fts_query(input: &str) -> String {
    input
        .split_whitespace()
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{}\"*", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn backend(error: impl std::fmt::Display) -> StorageError {
    StorageError::Backend(error.to_string())
}

fn json_backend(error: serde_json::Error) -> StorageError {
    StorageError::Backend(format!("invalid persisted JSON: {error}"))
}

fn validation(error: OperationValidationError) -> StorageError {
    match error {
        OperationValidationError::UnsupportedProtocol(version) => {
            StorageError::UnsupportedProtocol(version)
        }
        error => StorageError::InvalidOperation(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, time::Instant};

    use rusqlite::Connection;
    use serde_json::json;
    use skriuw_domain::{
        HistoryHeader, NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope,
        WorkspaceSettings,
    };
    use skriuw_storage::{
        Diagnostic, DiagnosticCategory, DiagnosticContext, HistoryCache, HistoryQueue,
        MAX_DIAGNOSTIC_MESSAGE_BYTES, StorageError, WorkspaceMaintenance, WorkspaceStorage,
    };
    use tempfile::tempdir;

    use super::{SqliteWorkspace, checksum};

    fn op(operation: WorkspaceOperation) -> WorkspaceOperationEnvelope {
        WorkspaceOperationEnvelope::v1(operation)
    }

    fn create_note(id: &str) -> WorkspaceOperationEnvelope {
        create_placed_note(id, NodePlacement::last(None), 1)
    }

    fn create_placed_note(
        id: &str,
        placement: NodePlacement,
        at: i64,
    ) -> WorkspaceOperationEnvelope {
        op(WorkspaceOperation::CreateNote {
            id: id.into(),
            title: "Fast notes".into(),
            placement,
            document_json: json!({"type": "doc", "content": []}),
            markdown: "# Fast notes\n\nSQLite search".into(),
            at,
        })
    }

    fn save_document(
        note_id: &str,
        expected_revision: i64,
        markdown: &str,
        at: i64,
    ) -> WorkspaceOperationEnvelope {
        op(WorkspaceOperation::SaveDocument {
            note_id: note_id.into(),
            document_json: json!({"type": "doc", "revision": expected_revision + 1}),
            markdown: markdown.into(),
            word_count: markdown.split_whitespace().count() as i64,
            expected_revision,
            at,
        })
    }

    fn custom_settings() -> WorkspaceSettings {
        let mut extensions = std::collections::BTreeMap::new();
        extensions.insert("futureFlag".into(), json!(true));
        WorkspaceSettings {
            theme: "paper".into(),
            compact_sidebar: true,
            extensions,
            ..WorkspaceSettings::default()
        }
    }

    fn ordered_ids(storage: &SqliteWorkspace, parent_id: Option<&str>) -> Vec<String> {
        storage
            .bootstrap()
            .expect("bootstrap")
            .nodes
            .into_iter()
            .filter(|node| node.parent_id.as_deref() == parent_id && node.deleted_at.is_none())
            .map(|node| node.id)
            .collect()
    }

    fn seed_nested_workspace(storage: &SqliteWorkspace) {
        storage
            .apply_operations(&[
                op(WorkspaceOperation::CreateFolder {
                    id: "folder-root".into(),
                    title: "Root".into(),
                    placement: NodePlacement::last(None),
                    at: 1,
                }),
                op(WorkspaceOperation::CreateFolder {
                    id: "folder-child".into(),
                    title: "Child".into(),
                    placement: NodePlacement::last(Some("folder-root".into())),
                    at: 2,
                }),
                op(WorkspaceOperation::CreateNote {
                    id: "note-nested".into(),
                    title: "Nested".into(),
                    placement: NodePlacement::last(Some("folder-child".into())),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: "nested search phrase".into(),
                    at: 3,
                }),
                op(WorkspaceOperation::CreateNote {
                    id: "note-outside".into(),
                    title: "Outside".into(),
                    placement: NodePlacement::last(None),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: "outside search phrase".into(),
                    at: 4,
                }),
            ])
            .expect("seed nested workspace");
    }

    #[test]
    fn creates_bootstraps_and_searches() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");

        let snapshot = storage.bootstrap().expect("bootstrap");
        assert_eq!(snapshot.nodes.len(), 1);
        assert_eq!(snapshot.documents[0].revision, 1);
        assert_eq!(snapshot.documents[0].word_count, 4);

        let hits = storage.search("SQLite", 10).expect("search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].note_id, "note-1");
    }

    #[test]
    fn allocates_semantic_placements_and_reports_rank_changes() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        let first_ack = storage
            .apply_operations(&[create_placed_note("a", NodePlacement::last(None), 1)])
            .expect("create first note");
        assert_eq!(first_ack.rank_changes.len(), 1);
        assert_eq!(first_ack.rank_changes[0].id, "a");
        assert_eq!(first_ack.rank_changes[0].rank, 1024);

        storage
            .apply_operations(&[create_placed_note("b", NodePlacement::last(None), 2)])
            .expect("create last note");
        storage
            .apply_operations(&[create_placed_note("c", NodePlacement::first(None), 3)])
            .expect("create first note");
        storage
            .apply_operations(&[create_placed_note("d", NodePlacement::after(None, "a"), 4)])
            .expect("create after note");
        storage
            .apply_operations(&[create_placed_note("e", NodePlacement::before(None, "a"), 5)])
            .expect("create before note");
        assert_eq!(ordered_ids(&storage, None), ["c", "e", "a", "d", "b"]);

        storage
            .apply_operations(&[op(WorkspaceOperation::CreateFolder {
                id: "folder".into(),
                title: "Folder".into(),
                placement: NodePlacement::last(None),
                at: 6,
            })])
            .expect("create folder");
        storage
            .apply_operations(&[
                create_placed_note("nested-a", NodePlacement::last(Some("folder".into())), 7),
                create_placed_note("nested-b", NodePlacement::first(Some("folder".into())), 8),
            ])
            .expect("create nested notes");
        let move_ack = storage
            .apply_operations(&[op(WorkspaceOperation::MoveNode {
                id: "d".into(),
                placement: NodePlacement::last(Some("folder".into())),
                at: 9,
            })])
            .expect("move into folder");

        assert_eq!(
            ordered_ids(&storage, Some("folder")),
            ["nested-b", "nested-a", "d"]
        );
        assert_eq!(move_ack.rank_changes.len(), 1);
        assert_eq!(move_ack.rank_changes[0].id, "d");
        assert_eq!(
            move_ack.rank_changes[0].parent_id.as_deref(),
            Some("folder")
        );
        assert_eq!(move_ack.rank_changes[0].rank, 2048);
    }

    #[test]
    fn rejects_anchor_outside_requested_active_siblings() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[
                op(WorkspaceOperation::CreateFolder {
                    id: "folder".into(),
                    title: "Folder".into(),
                    placement: NodePlacement::last(None),
                    at: 1,
                }),
                create_placed_note("nested", NodePlacement::last(Some("folder".into())), 2),
            ])
            .expect("seed nodes");

        assert!(matches!(
            storage.apply_operations(&[create_placed_note(
                "wrong-parent",
                NodePlacement::before(None, "nested"),
                3,
            )]),
            Err(StorageError::InvalidOperation(_))
        ));
        storage
            .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
                root_id: "nested".into(),
                at: 3,
            })])
            .expect("trash anchor");
        assert!(matches!(
            storage.apply_operations(&[create_placed_note(
                "trashed-anchor",
                NodePlacement::before(Some("folder".into()), "nested"),
                4,
            )]),
            Err(StorageError::InvalidOperation(_))
        ));
    }

    #[test]
    fn repeated_insertion_compacts_only_destination_siblings() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[
                create_placed_note("a", NodePlacement::last(None), 1),
                create_placed_note("b", NodePlacement::last(None), 2),
                op(WorkspaceOperation::CreateFolder {
                    id: "folder".into(),
                    title: "Folder".into(),
                    placement: NodePlacement::last(None),
                    at: 3,
                }),
                create_placed_note("nested", NodePlacement::last(Some("folder".into())), 4),
            ])
            .expect("seed sibling sets");

        let mut compaction_ack = None;
        for index in 0..11 {
            let id = format!("x{index:02}");
            let ack = storage
                .apply_operations(&[create_placed_note(
                    &id,
                    NodePlacement::after(None, "a"),
                    10 + index,
                )])
                .expect("insert after anchor");
            if ack.rank_changes.len() > 1 {
                compaction_ack = Some(ack);
            }
        }

        let ack = compaction_ack.expect("rank compaction acknowledgement");
        assert!(ack.rank_changes.iter().any(|change| change.id == "x10"));
        assert!(!ack.rank_changes.iter().any(|change| change.id == "nested"));
        let snapshot = storage.bootstrap().expect("bootstrap");
        let root_ranks = snapshot
            .nodes
            .iter()
            .filter(|node| node.parent_id.is_none())
            .map(|node| node.rank)
            .collect::<Vec<_>>();
        assert_eq!(
            root_ranks,
            (1..=root_ranks.len())
                .map(|position| i64::try_from(position).expect("rank position") * 1024)
                .collect::<Vec<_>>()
        );
        let nested = snapshot
            .nodes
            .iter()
            .find(|node| node.id == "nested")
            .expect("nested note");
        assert_eq!(nested.rank, 1024);
        assert_eq!(
            ordered_ids(&storage, None),
            [
                "a", "x10", "x09", "x08", "x07", "x06", "x05", "x04", "x03", "x02", "x01", "x00",
                "b", "folder",
            ]
        );
    }

    #[test]
    fn compaction_uses_id_ties_deterministically() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[
                create_placed_note("b", NodePlacement::last(None), 1),
                create_placed_note("a", NodePlacement::last(None), 2),
            ])
            .expect("seed notes");
        {
            let connection = storage.lock().expect("database lock");
            connection
                .execute("UPDATE workspace_nodes SET rank = 100", [])
                .expect("create deterministic tie");
        }

        let ack = storage
            .apply_operations(&[create_placed_note(
                "between",
                NodePlacement::after(None, "a"),
                3,
            )])
            .expect("compact tied ranks");

        assert_eq!(ordered_ids(&storage, None), ["a", "between", "b"]);
        assert_eq!(ack.rank_changes.len(), 3);
        assert_eq!(
            ack.rank_changes
                .iter()
                .map(|change| change.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "b", "between"]
        );
    }

    #[test]
    fn compaction_rolls_back_with_failed_operation_batch() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[
                create_placed_note("a", NodePlacement::last(None), 1),
                create_placed_note("b", NodePlacement::last(None), 2),
            ])
            .expect("seed notes");
        for index in 0..10 {
            let id = format!("x{index:02}");
            storage
                .apply_operations(&[create_placed_note(
                    &id,
                    NodePlacement::after(None, "a"),
                    10 + index,
                )])
                .expect("consume midpoint gap");
        }
        let before = storage
            .bootstrap()
            .expect("bootstrap before rollback")
            .nodes
            .into_iter()
            .map(|node| (node.id, node.rank))
            .collect::<Vec<_>>();

        storage
            .apply_operations(&[
                create_placed_note("x10", NodePlacement::after(None, "a"), 30),
                op(WorkspaceOperation::RenameNode {
                    id: "missing".into(),
                    title: "Missing".into(),
                    at: 30,
                }),
            ])
            .expect_err("rollback compaction batch");
        let after = storage
            .bootstrap()
            .expect("bootstrap after rollback")
            .nodes
            .into_iter()
            .map(|node| (node.id, node.rank))
            .collect::<Vec<_>>();

        assert_eq!(after, before);
        assert!(!after.iter().any(|(id, _)| id == "x10"));
    }

    #[test]
    fn batched_rank_changes_coalesce_to_final_state() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[
                create_placed_note("a", NodePlacement::last(None), 1),
                create_placed_note("b", NodePlacement::last(None), 2),
            ])
            .expect("seed notes");

        let ack = storage
            .apply_operations(&[
                op(WorkspaceOperation::MoveNode {
                    id: "a".into(),
                    placement: NodePlacement::last(None),
                    at: 3,
                }),
                op(WorkspaceOperation::MoveNode {
                    id: "a".into(),
                    placement: NodePlacement::first(None),
                    at: 4,
                }),
            ])
            .expect("move note twice");

        assert_eq!(ack.rank_changes.len(), 1);
        assert_eq!(ack.rank_changes[0].id, "a");
        assert_eq!(ack.rank_changes[0].rank, 1024);
        assert_eq!(ordered_ids(&storage, None), ["a", "b"]);
    }

    #[test]
    #[ignore = "manual backend performance measurement"]
    fn benchmarks_5000_sibling_placements() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        let operations = (0..5000)
            .map(|index| {
                create_placed_note(
                    &format!("note-{index:04}"),
                    NodePlacement::last(None),
                    i64::from(index),
                )
            })
            .collect::<Vec<_>>();
        let started = Instant::now();
        let ack = storage
            .apply_operations(&operations)
            .expect("place 5000 siblings");
        let elapsed = started.elapsed();

        assert_eq!(ack.applied, 5000);
        assert_eq!(ack.rank_changes.len(), 5000);
        assert_eq!(storage.bootstrap().expect("bootstrap").nodes.len(), 5000);
        eprintln!("5000 sibling placements: {elapsed:?}");
    }

    #[test]
    fn rejects_stale_document_revision() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");

        let error = storage
            .apply_operations(&[op(WorkspaceOperation::SaveDocument {
                note_id: "note-1".into(),
                document_json: json!({"type": "doc"}),
                markdown: "changed".into(),
                word_count: 1,
                expected_revision: 9,
                at: 2,
            })])
            .expect_err("revision conflict");

        assert!(matches!(
            error,
            StorageError::RevisionConflict {
                expected: 9,
                current: 1,
                ..
            }
        ));
    }

    #[test]
    fn batches_saves_without_losing_conflicts_or_history() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");
        let batches = vec![
            vec![save_document("note-1", 1, "revision two", 2)],
            vec![save_document("note-1", 1, "stale revision", 3)],
            vec![save_document("note-1", 2, "revision three", 4)],
        ];

        let results = storage
            .apply_operation_batches(&batches)
            .expect("apply save batches");

        assert_eq!(results.len(), 3);
        assert_eq!(
            results[0].as_ref().expect("first save").revisions[0].revision,
            2
        );
        assert!(matches!(
            results[1],
            Err(StorageError::RevisionConflict {
                expected: 1,
                current: 2,
                ..
            })
        ));
        assert_eq!(
            results[2].as_ref().expect("third save").revisions[0].revision,
            3
        );
        let snapshot = storage.bootstrap().expect("bootstrap");
        assert_eq!(snapshot.documents[0].revision, 3);
        assert_eq!(snapshot.documents[0].markdown, "revision three");
        let connection = storage.lock().expect("database lock");
        let revisions = connection
            .prepare(
                "SELECT revision FROM history_outbox WHERE note_id = 'note-1' ORDER BY revision",
            )
            .expect("prepare history query")
            .query_map([], |row| row.get::<_, i64>(0))
            .expect("query history")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect history revisions");
        assert_eq!(revisions, [1, 2, 3]);
    }

    #[test]
    fn savepoint_rolls_back_only_the_failed_request_group() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");
        let batches = vec![
            vec![
                save_document("note-1", 1, "rolled back", 2),
                op(WorkspaceOperation::RenameNode {
                    id: "missing".into(),
                    title: "Missing".into(),
                    at: 2,
                }),
            ],
            vec![save_document("note-1", 1, "committed", 3)],
        ];

        let results = storage
            .apply_operation_batches(&batches)
            .expect("apply grouped operations");

        assert!(matches!(results[0], Err(StorageError::NotFound(_))));
        assert_eq!(
            results[1].as_ref().expect("second group").revisions[0].revision,
            2
        );
        let snapshot = storage.bootstrap().expect("bootstrap");
        assert_eq!(snapshot.documents[0].revision, 2);
        assert_eq!(snapshot.documents[0].markdown, "committed");
    }

    #[test]
    #[ignore = "manual backend performance measurement"]
    fn benchmarks_1000_lossless_save_requests() {
        let directory = tempdir().expect("temporary directory");
        let grouped = SqliteWorkspace::open(directory.path().join("grouped.sqlite"))
            .expect("open grouped database");
        let sequential = SqliteWorkspace::open(directory.path().join("sequential.sqlite"))
            .expect("open sequential database");
        grouped
            .apply_operations(&[create_note("note-1")])
            .expect("seed grouped database");
        sequential
            .apply_operations(&[create_note("note-1")])
            .expect("seed sequential database");
        let batches = (1..=1000)
            .map(|expected_revision| {
                vec![save_document(
                    "note-1",
                    expected_revision,
                    &format!("revision {}", expected_revision + 1),
                    expected_revision + 1,
                )]
            })
            .collect::<Vec<_>>();

        let grouped_started = Instant::now();
        let mut grouped_results = Vec::with_capacity(batches.len());
        for batch_group in batches.chunks(64) {
            grouped_results.extend(
                grouped
                    .apply_operation_batches(batch_group)
                    .expect("apply grouped saves"),
            );
        }
        let grouped_elapsed = grouped_started.elapsed();

        let sequential_started = Instant::now();
        for operations in &batches {
            sequential
                .apply_operations(operations)
                .expect("apply sequential save");
        }
        let sequential_elapsed = sequential_started.elapsed();

        assert_eq!(grouped_results.len(), 1000);
        assert!(grouped_results.iter().all(Result::is_ok));
        assert_eq!(
            grouped.bootstrap().expect("grouped snapshot").documents[0].revision,
            1001
        );
        assert_eq!(
            sequential
                .bootstrap()
                .expect("sequential snapshot")
                .documents[0]
                .revision,
            1001
        );
        eprintln!(
            "1000 lossless saves: grouped {grouped_elapsed:?}; sequential {sequential_elapsed:?}"
        );
    }

    #[test]
    fn rolls_back_complete_operation_batch() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        let operations = [
            create_note("note-1"),
            op(WorkspaceOperation::RenameNode {
                id: "missing".into(),
                title: "Nope".into(),
                at: 2,
            }),
        ];

        storage
            .apply_operations(&operations)
            .expect_err("batch must fail");
        assert!(storage.bootstrap().expect("bootstrap").nodes.is_empty());
    }

    #[test]
    fn rejects_folder_cycles() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[
                op(WorkspaceOperation::CreateFolder {
                    id: "parent".into(),
                    title: "Parent".into(),
                    placement: NodePlacement::last(None),
                    at: 1,
                }),
                op(WorkspaceOperation::CreateFolder {
                    id: "child".into(),
                    title: "Child".into(),
                    placement: NodePlacement::last(Some("parent".into())),
                    at: 2,
                }),
            ])
            .expect("create folders");

        let error = storage
            .apply_operations(&[op(WorkspaceOperation::MoveNode {
                id: "parent".into(),
                placement: NodePlacement::last(Some("child".into())),
                at: 3,
            })])
            .expect_err("cycle must fail");
        assert!(matches!(error, StorageError::InvalidOperation(_)));
    }

    #[test]
    fn records_immutable_migration_checksum() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        let connection = storage.lock().expect("database lock");
        let mut statement = connection
            .prepare("SELECT version, name, checksum FROM schema_migrations ORDER BY version")
            .expect("prepare migration query");
        let recorded = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .expect("migration rows")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect migration rows");

        assert_eq!(recorded.len(), super::MIGRATIONS.len());
        for (record, migration) in recorded.iter().zip(super::MIGRATIONS) {
            assert_eq!(record.0, migration.version);
            assert_eq!(record.1, migration.name);
            assert_eq!(record.2.len(), 64);
            assert_eq!(record.2, checksum(migration.sql));
        }
    }

    #[test]
    fn rejects_migration_checksum_drift() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        {
            let connection = storage.lock().expect("database lock");
            connection
                .execute(
                    "UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1",
                    [],
                )
                .expect("tamper checksum");
        }

        let error = {
            let mut connection = storage.lock().expect("database lock");
            SqliteWorkspace::migrate(&mut connection).expect_err("checksum drift")
        };
        assert!(error.to_string().contains("checksum drift"));
    }

    #[test]
    fn upgrades_legacy_pre_release_database_without_data_loss() {
        let mut connection = Connection::open_in_memory().expect("open database");
        SqliteWorkspace::configure(&connection).expect("configure database");
        connection
            .execute_batch(include_str!("../tests/fixtures/legacy_0001.sql"))
            .expect("create legacy database");
        connection
            .execute(
                "INSERT INTO workspace_nodes \
                 (id, kind, rank, title, created_at, updated_at) \
                 VALUES ('note-1', 'note', 1024, 'Legacy', 1, 1)",
                [],
            )
            .expect("create legacy node");
        connection
            .execute(
                "INSERT INTO git_outbox(id, note_id, revision, markdown, created_at) \
                 VALUES ('item-1', 'note-1', 1, '# Legacy', 1)",
                [],
            )
            .expect("create legacy history item");
        connection
            .execute_batch(
                "INSERT INTO app_state(key, value_json) VALUES ('setting:theme', '\"dark\"');\
                 INSERT INTO app_state(key, value_json) VALUES ('setting:custom_flag', 'true');",
            )
            .expect("create legacy setting rows");

        SqliteWorkspace::migrate(&mut connection).expect("upgrade database");

        let pending = connection
            .query_row(
                "SELECT note_id, attempts FROM history_outbox WHERE id = 'item-1'",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
            .expect("upgraded history item");
        let checksum = connection
            .query_row(
                "SELECT checksum FROM schema_migrations WHERE version = 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .expect("upgraded migration checksum");

        assert_eq!(pending, ("note-1".into(), 0));
        assert_eq!(checksum.len(), 64);
        assert!(
            super::table_columns(&connection, "history_cache")
                .expect("history columns")
                .iter()
                .any(|column| column == "version_id")
        );

        let settings = super::read_settings(&connection).expect("normalized settings");
        assert_eq!(settings.theme, "dark");
        assert_eq!(settings.extensions["custom_flag"], json!(true));
        let stray = connection
            .query_row(
                "SELECT count(*) FROM app_state WHERE key LIKE 'setting:%'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count stray rows");
        assert_eq!(stray, 0);
    }

    #[test]
    fn persists_normalized_settings_document_and_defaults() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        assert_eq!(
            storage.bootstrap().expect("bootstrap defaults").settings,
            WorkspaceSettings::default()
        );

        let settings = custom_settings();
        storage
            .apply_operations(&[op(WorkspaceOperation::UpdateSettings {
                settings: settings.clone(),
            })])
            .expect("update settings");
        assert_eq!(storage.bootstrap().expect("bootstrap").settings, settings);

        let unsupported = WorkspaceSettings {
            settings_version: 2,
            ..WorkspaceSettings::default()
        };
        storage
            .apply_operations(&[op(WorkspaceOperation::UpdateSettings {
                settings: unsupported,
            })])
            .expect_err("reject unsupported settings version");
        assert_eq!(
            storage
                .bootstrap()
                .expect("bootstrap after rejection")
                .settings,
            settings
        );
    }

    #[test]
    fn settings_update_rolls_back_with_failed_batch() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[
                op(WorkspaceOperation::UpdateSettings {
                    settings: custom_settings(),
                }),
                op(WorkspaceOperation::RenameNode {
                    id: "missing".into(),
                    title: "Nope".into(),
                    at: 1,
                }),
            ])
            .expect_err("failed batch");

        assert_eq!(
            storage.bootstrap().expect("bootstrap").settings,
            WorkspaceSettings::default()
        );
    }

    #[test]
    fn rolls_back_invalid_history_cache_rebuild() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");
        storage
            .replace_history_headers(&[HistoryHeader {
                note_id: "note-1".into(),
                version_id: "version-old".into(),
                created_at: 1,
                summary: "Old".into(),
            }])
            .expect("seed history cache");

        storage
            .replace_history_headers(&[
                HistoryHeader {
                    note_id: "note-1".into(),
                    version_id: "version-new".into(),
                    created_at: 2,
                    summary: "New".into(),
                },
                HistoryHeader {
                    note_id: "note-1".into(),
                    version_id: "version-invalid".into(),
                    created_at: -1,
                    summary: "Invalid".into(),
                },
            ])
            .expect_err("invalid cache rebuild");
        let snapshot = storage.bootstrap().expect("bootstrap");

        assert_eq!(snapshot.history_headers.len(), 1);
        assert_eq!(snapshot.history_headers[0].version_id, "version-old");
    }

    #[test]
    fn persists_bounded_history_diagnostic_records() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");
        let item = storage
            .claim_history_revision("worker-1", 10, 1_000)
            .expect("claim history")
            .expect("history item");
        let diagnostic = Diagnostic::new(
            DiagnosticContext::History,
            DiagnosticCategory::Backend,
            format!("\n{}\t", "failure".repeat(300)),
        );

        storage
            .release_history_revision("worker-1", &item.id, &diagnostic)
            .expect("release history");

        let persisted = storage
            .lock()
            .expect("database lock")
            .query_row(
                "SELECT last_error FROM history_outbox WHERE id = ?1",
                [&item.id],
                |row| row.get::<_, String>(0),
            )
            .expect("persisted diagnostic");
        assert_eq!(persisted, diagnostic.to_string());
        assert!(persisted.starts_with("history.backend: "));
        assert!(persisted.len() <= "history.backend: ".len() + MAX_DIAGNOSTIC_MESSAGE_BYTES);
        assert!(!persisted.contains(char::is_control));
    }

    #[test]
    fn exports_and_replaces_workspace_from_portable_archive() {
        let source = SqliteWorkspace::open_in_memory().expect("open source database");
        source
            .apply_operations(&[
                op(WorkspaceOperation::CreateFolder {
                    id: "folder-1".into(),
                    title: "Folder".into(),
                    placement: NodePlacement::last(None),
                    at: 1,
                }),
                op(WorkspaceOperation::CreateNote {
                    id: "note-1".into(),
                    title: "Imported".into(),
                    placement: NodePlacement::last(Some("folder-1".into())),
                    document_json: json!({"type": "doc", "content": []}),
                    markdown: "# Portable archive".into(),
                    at: 2,
                }),
                op(WorkspaceOperation::UpdateSettings {
                    settings: custom_settings(),
                }),
                op(WorkspaceOperation::SetActiveNote {
                    note_id: Some("note-1".into()),
                }),
            ])
            .expect("seed source");
        let archive = source.export_archive(100).expect("export archive");
        let target = SqliteWorkspace::open_in_memory().expect("open target database");
        target
            .apply_operations(&[create_note("replaced-note")])
            .expect("seed target");

        let summary = target
            .replace_from_archive(&archive)
            .expect("replace from archive");
        let round_trip = target.export_archive(100).expect("export imported archive");

        assert_eq!(summary.nodes, 2);
        assert_eq!(summary.documents, 1);
        assert_eq!(summary.history_items, 1);
        assert_eq!(round_trip, archive);
        assert_eq!(target.search("Portable", 10).expect("search").len(), 1);
    }

    #[test]
    fn invalid_archive_cannot_replace_existing_workspace() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");
        let before = storage.bootstrap().expect("bootstrap before import");
        let mut archive = storage.export_archive(100).expect("export archive");
        archive.documents.clear();

        storage
            .replace_from_archive(&archive)
            .expect_err("reject invalid archive");
        let after = storage.bootstrap().expect("bootstrap after import");

        assert_eq!(after, before);
    }

    #[test]
    fn integrity_check_covers_sqlite_and_domain_state() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");

        let report = storage.integrity_check().expect("integrity check");

        assert!(report.healthy);
        assert!(report.issues.is_empty());
    }

    #[test]
    fn search_excludes_deleted_notes() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");
        storage
            .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
                root_id: "note-1".into(),
                at: 2,
            })])
            .expect("delete note");

        assert!(storage.search("SQLite", 10).expect("search").is_empty());
    }

    #[test]
    fn trash_hides_complete_subtree_and_clears_active_note() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        seed_nested_workspace(&storage);
        storage
            .replace_history_headers(&[
                HistoryHeader {
                    note_id: "note-nested".into(),
                    version_id: "nested-version".into(),
                    created_at: 3,
                    summary: "Nested".into(),
                },
                HistoryHeader {
                    note_id: "note-outside".into(),
                    version_id: "outside-version".into(),
                    created_at: 4,
                    summary: "Outside".into(),
                },
            ])
            .expect("seed history cache");
        storage
            .apply_operations(&[op(WorkspaceOperation::SetActiveNote {
                note_id: Some("note-nested".into()),
            })])
            .expect("activate nested note");

        storage
            .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
                root_id: "folder-root".into(),
                at: 10,
            })])
            .expect("trash subtree");

        let snapshot = storage.bootstrap().expect("bootstrap");
        let root = snapshot
            .nodes
            .iter()
            .find(|node| node.id == "folder-root")
            .expect("root node");
        let child = snapshot
            .nodes
            .iter()
            .find(|node| node.id == "folder-child")
            .expect("child node");
        assert_eq!(root.deleted_at, Some(10));
        assert_eq!(child.deleted_at, None);
        assert_eq!(snapshot.active_note_id, None);
        assert_eq!(
            snapshot.unavailable_node_ids(),
            ["folder-child", "folder-root", "note-nested"]
                .into_iter()
                .collect()
        );
        assert_eq!(snapshot.history_headers.len(), 1);
        assert_eq!(snapshot.history_headers[0].note_id, "note-outside");
        assert!(storage.search("nested", 10).expect("search").is_empty());
        assert_eq!(
            storage
                .claim_history_revision("worker", 20, 10)
                .expect("claim history")
                .expect("available history item")
                .note_id,
            "note-outside"
        );
    }

    #[test]
    fn commands_reject_descendants_of_trashed_folder() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        seed_nested_workspace(&storage);
        storage
            .apply_operations(&[op(WorkspaceOperation::TrashSubtree {
                root_id: "folder-root".into(),
                at: 10,
            })])
            .expect("trash subtree");

        let operations = [
            WorkspaceOperation::RenameNode {
                id: "note-nested".into(),
                title: "Hidden rename".into(),
                at: 11,
            },
            WorkspaceOperation::MoveNode {
                id: "folder-child".into(),
                placement: NodePlacement::last(None),
                at: 11,
            },
            WorkspaceOperation::SaveDocument {
                note_id: "note-nested".into(),
                document_json: json!({"type": "doc"}),
                markdown: "hidden save".into(),
                word_count: 2,
                expected_revision: 1,
                at: 11,
            },
            WorkspaceOperation::SetActiveNote {
                note_id: Some("note-nested".into()),
            },
            WorkspaceOperation::CreateNote {
                id: "hidden-new-note".into(),
                title: "Hidden".into(),
                placement: NodePlacement::last(Some("folder-child".into())),
                document_json: json!({"type": "doc"}),
                markdown: String::new(),
                at: 11,
            },
        ];

        for operation in operations {
            assert!(matches!(
                storage.apply_operations(&[op(operation)]),
                Err(StorageError::InvalidOperation(_))
            ));
        }
    }

    #[test]
    fn restore_requires_active_destination_and_preserves_independent_trash() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        seed_nested_workspace(&storage);
        storage
            .apply_operations(&[
                op(WorkspaceOperation::TrashSubtree {
                    root_id: "note-nested".into(),
                    at: 5,
                }),
                op(WorkspaceOperation::TrashSubtree {
                    root_id: "folder-root".into(),
                    at: 6,
                }),
            ])
            .expect("trash nested roots");

        assert!(matches!(
            storage.apply_operations(&[op(WorkspaceOperation::RestoreSubtree {
                root_id: "note-nested".into(),
                placement: NodePlacement::last(Some("folder-child".into())),
                at: 7,
            })]),
            Err(StorageError::InvalidOperation(_))
        ));
        assert!(matches!(
            storage.apply_operations(&[op(WorkspaceOperation::RestoreSubtree {
                root_id: "note-nested".into(),
                placement: NodePlacement::last(Some("missing-folder".into())),
                at: 7,
            })]),
            Err(StorageError::NotFound(_))
        ));

        storage
            .apply_operations(&[op(WorkspaceOperation::RestoreSubtree {
                root_id: "folder-root".into(),
                placement: NodePlacement::last(None),
                at: 8,
            })])
            .expect("restore parent subtree");
        let snapshot = storage.bootstrap().expect("bootstrap restored parent");
        assert_eq!(
            snapshot.unavailable_node_ids(),
            ["note-nested"].into_iter().collect()
        );
        assert!(storage.search("nested", 10).expect("search").is_empty());

        storage
            .apply_operations(&[op(WorkspaceOperation::RestoreSubtree {
                root_id: "note-nested".into(),
                placement: NodePlacement::last(Some("folder-child".into())),
                at: 9,
            })])
            .expect("restore independent note");
        assert_eq!(storage.search("nested", 10).expect("search").len(), 1);
    }

    #[test]
    fn trash_rolls_back_active_note_and_visibility_with_failed_batch() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        seed_nested_workspace(&storage);
        storage
            .apply_operations(&[op(WorkspaceOperation::SetActiveNote {
                note_id: Some("note-nested".into()),
            })])
            .expect("activate nested note");

        storage
            .apply_operations(&[
                op(WorkspaceOperation::TrashSubtree {
                    root_id: "folder-root".into(),
                    at: 10,
                }),
                op(WorkspaceOperation::RenameNode {
                    id: "missing".into(),
                    title: "Missing".into(),
                    at: 10,
                }),
            ])
            .expect_err("rollback trash batch");

        let snapshot = storage.bootstrap().expect("bootstrap");
        assert_eq!(snapshot.active_note_id.as_deref(), Some("note-nested"));
        assert!(snapshot.unavailable_node_ids().is_empty());
        assert_eq!(storage.search("nested", 10).expect("search").len(), 1);
    }

    #[test]
    fn purge_removes_subtree_projections_and_history_atomically() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        seed_nested_workspace(&storage);
        storage
            .replace_history_headers(&[HistoryHeader {
                note_id: "note-nested".into(),
                version_id: "nested-version".into(),
                created_at: 3,
                summary: "Nested".into(),
            }])
            .expect("seed history cache");
        storage
            .apply_operations(&[
                op(WorkspaceOperation::TrashSubtree {
                    root_id: "folder-root".into(),
                    at: 10,
                }),
                op(WorkspaceOperation::PurgeSubtree {
                    root_id: "folder-root".into(),
                    trashed_before: 10,
                }),
            ])
            .expect("purge subtree");

        let snapshot = storage.bootstrap().expect("bootstrap");
        assert_eq!(snapshot.nodes.len(), 1);
        assert_eq!(snapshot.nodes[0].id, "note-outside");
        assert_eq!(snapshot.documents.len(), 1);
        assert!(snapshot.history_headers.is_empty());
        let connection = storage.lock().expect("database lock");
        for (table, expected) in [
            ("workspace_nodes", 1),
            ("documents", 1),
            ("documents_fts", 1),
            ("history_cache", 0),
            ("history_outbox", 1),
        ] {
            let count = connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("count rows");
            assert_eq!(count, expected, "unexpected surviving rows in {table}");
        }
    }

    #[test]
    fn purge_enforces_retention_and_rolls_back_with_batch() {
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        seed_nested_workspace(&storage);
        storage
            .replace_history_headers(&[HistoryHeader {
                note_id: "note-nested".into(),
                version_id: "nested-version".into(),
                created_at: 3,
                summary: "Nested".into(),
            }])
            .expect("seed history cache");
        storage
            .apply_operations(&[
                op(WorkspaceOperation::TrashSubtree {
                    root_id: "note-nested".into(),
                    at: 11,
                }),
                op(WorkspaceOperation::TrashSubtree {
                    root_id: "folder-root".into(),
                    at: 10,
                }),
            ])
            .expect("trash subtree");

        assert!(matches!(
            storage.apply_operations(&[op(WorkspaceOperation::PurgeSubtree {
                root_id: "folder-root".into(),
                trashed_before: 10,
            })]),
            Err(StorageError::InvalidOperation(_))
        ));
        storage
            .apply_operations(&[
                op(WorkspaceOperation::PurgeSubtree {
                    root_id: "folder-root".into(),
                    trashed_before: 11,
                }),
                op(WorkspaceOperation::RenameNode {
                    id: "missing".into(),
                    title: "Missing".into(),
                    at: 11,
                }),
            ])
            .expect_err("rollback purge batch");

        let snapshot = storage.bootstrap().expect("bootstrap");
        assert_eq!(snapshot.nodes.len(), 4);
        assert_eq!(snapshot.documents.len(), 2);
        let connection = storage.lock().expect("database lock");
        let projection_counts = ["documents_fts", "history_cache", "history_outbox"].map(|table| {
            connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("count projection rows")
        });
        assert_eq!(projection_counts, [2, 1, 2]);
    }

    #[test]
    fn creates_verified_online_backup() {
        let directory = tempdir().expect("temporary directory");
        let backup_path = directory.path().join("workspace.backup.db");
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");

        storage.backup_to(&backup_path).expect("create backup");
        assert!(!PathBuf::from(format!("{}-wal", backup_path.display())).exists());
        assert!(!PathBuf::from(format!("{}-shm", backup_path.display())).exists());
        let backup = SqliteWorkspace::open(&backup_path).expect("open backup");

        assert_eq!(backup.bootstrap().expect("backup snapshot").nodes.len(), 1);
        assert_eq!(backup.quick_check().expect("backup check"), "ok");
    }

    #[test]
    fn backup_refuses_existing_target() {
        let directory = tempdir().expect("temporary directory");
        let backup_path = directory.path().join("workspace.backup.db");
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage.backup_to(&backup_path).expect("create backup");

        let error = storage
            .backup_to(&backup_path)
            .expect_err("existing backup target");

        assert!(matches!(error, StorageError::AlreadyExists(_)));
    }

    #[test]
    fn restores_verified_backup_to_new_database() {
        let directory = tempdir().expect("temporary directory");
        let backup_path = directory.path().join("workspace.backup.db");
        let restore_path = directory.path().join("restored.db");
        let storage = SqliteWorkspace::open_in_memory().expect("open database");
        storage
            .apply_operations(&[create_note("note-1")])
            .expect("create note");
        storage.backup_to(&backup_path).expect("create backup");

        SqliteWorkspace::restore_backup_to(&backup_path, &restore_path).expect("restore backup");
        let restored = SqliteWorkspace::open(&restore_path).expect("open restored database");

        assert_eq!(
            restored.bootstrap().expect("restored snapshot").nodes[0].id,
            "note-1"
        );
    }

    #[test]
    fn rejects_corrupt_backup_without_creating_target() {
        let directory = tempdir().expect("temporary directory");
        let backup_path = directory.path().join("corrupt.db");
        let restore_path = directory.path().join("restored.db");
        std::fs::write(&backup_path, b"not a SQLite database").expect("write corrupt backup");

        SqliteWorkspace::restore_backup_to(&backup_path, &restore_path)
            .expect_err("reject corrupt backup");

        assert!(!restore_path.exists());
    }
}
