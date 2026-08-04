use std::collections::BTreeMap;

use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use sha2::{Digest, Sha256};
use skriuw_storage::StorageError;

use crate::error::backend;

pub(crate) const MIGRATIONS: &[Migration] = &[
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
    Migration {
        version: 3,
        name: "relationships",
        sql: include_str!("../../../migrations/0003_relationships.sql"),
    },
    Migration {
        version: 4,
        name: "entity_provenance",
        sql: include_str!("../../../migrations/0004_entity_provenance.sql"),
    },
    Migration {
        version: 5,
        name: "pinned_nodes",
        sql: include_str!("../../../migrations/0005_pinned_nodes.sql"),
    },
    Migration {
        version: 6,
        name: "note_images",
        sql: include_str!("../../../migrations/0006_note_images.sql"),
    },
    Migration {
        version: 7,
        name: "typed_note_properties",
        sql: include_str!("../../../migrations/0007_typed_note_properties.sql"),
    },
    Migration {
        version: 8,
        name: "provider_import_receipts",
        sql: include_str!("../../../migrations/0008_provider_import_receipts.sql"),
    },
    Migration {
        version: 9,
        name: "note_covers",
        sql: include_str!("../../../migrations/0009_note_covers.sql"),
    },
    Migration {
        version: 10,
        name: "history_retry_backoff",
        sql: include_str!("../../../migrations/0010_history_retry_backoff.sql"),
    },
    Migration {
        version: 11,
        name: "sync_outbox",
        sql: include_str!("../../../migrations/0011_sync_outbox.sql"),
    },
    Migration {
        version: 12,
        name: "sync_inbound",
        sql: include_str!("../../../migrations/0012_sync_inbound.sql"),
    },
];

pub(crate) struct Migration {
    pub(crate) version: i64,
    pub(crate) name: &'static str,
    pub(crate) sql: &'static str,
}

pub(crate) struct AppliedMigration {
    pub(crate) name: String,
    pub(crate) checksum: String,
}

pub(crate) fn validate_migration_list() -> Result<(), StorageError> {
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

pub(crate) fn upgrade_legacy_ledger(connection: &mut Connection) -> Result<(), StorageError> {
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

    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(backend)?;
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

pub(crate) fn table_columns(
    connection: &Connection,
    table: &str,
) -> Result<Vec<String>, StorageError> {
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

pub(crate) fn read_migrations(
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

pub(crate) fn verify_migration(
    migration: &Migration,
    applied: &AppliedMigration,
) -> Result<(), StorageError> {
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

pub(crate) fn checksum(sql: &str) -> String {
    format!("{:x}", Sha256::digest(sql.as_bytes()))
}
