use std::collections::BTreeMap;

use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use sha2::{Digest, Sha256};
use skriuw_storage::StorageError;

use crate::error::backend;

pub(crate) const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial",
        sql: include_str!("../migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        name: "settings_document",
        sql: include_str!("../migrations/0002_settings_document.sql"),
    },
    Migration {
        version: 3,
        name: "relationships",
        sql: include_str!("../migrations/0003_relationships.sql"),
    },
    Migration {
        version: 4,
        name: "entity_provenance",
        sql: include_str!("../migrations/0004_entity_provenance.sql"),
    },
    Migration {
        version: 5,
        name: "pinned_nodes",
        sql: include_str!("../migrations/0005_pinned_nodes.sql"),
    },
    Migration {
        version: 6,
        name: "note_images",
        sql: include_str!("../migrations/0006_note_images.sql"),
    },
    Migration {
        version: 7,
        name: "typed_note_properties",
        sql: include_str!("../migrations/0007_typed_note_properties.sql"),
    },
    Migration {
        version: 8,
        name: "provider_import_receipts",
        sql: include_str!("../migrations/0008_provider_import_receipts.sql"),
    },
    Migration {
        version: 9,
        name: "note_covers",
        sql: include_str!("../migrations/0009_note_covers.sql"),
    },
    Migration {
        version: 10,
        name: "history_retry_backoff",
        sql: include_str!("../migrations/0010_history_retry_backoff.sql"),
    },
    Migration {
        version: 11,
        name: "sync_outbox",
        sql: include_str!("../migrations/0011_sync_outbox.sql"),
    },
    Migration {
        version: 12,
        name: "sync_inbound",
        sql: include_str!("../migrations/0012_sync_inbound.sql"),
    },
    Migration {
        version: 13,
        name: "sync_convergence",
        sql: include_str!("../migrations/0013_sync_convergence.sql"),
    },
    Migration {
        version: 14,
        name: "blocked_asset_content",
        sql: include_str!("../migrations/0014_blocked_asset_content.sql"),
    },
    Migration {
        version: 15,
        name: "blocked_operation_recovery",
        sql: include_str!("../migrations/0015_blocked_operation_recovery.sql"),
    },
    Migration {
        version: 16,
        name: "workspace_tasks",
        sql: include_str!("../migrations/0016_workspace_tasks.sql"),
    },
    Migration {
        version: 17,
        name: "workspace_prompts",
        sql: include_str!("../migrations/0017_workspace_prompts.sql"),
    },
    Migration {
        version: 18,
        name: "ai_run_history",
        sql: include_str!("../migrations/0018_ai_run_history.sql"),
    },
    Migration {
        version: 19,
        name: "note_annotations",
        sql: include_str!("../migrations/0019_note_annotations.sql"),
    },
    Migration {
        version: 20,
        name: "history_diff_stats",
        sql: include_str!("../migrations/0020_history_diff_stats.sql"),
    },
    Migration {
        version: 21,
        name: "sync_document_heads",
        sql: include_str!("../migrations/0021_sync_document_heads.sql"),
    },
    Migration {
        version: 22,
        name: "history_word_count",
        sql: include_str!("../migrations/0022_history_word_count.sql"),
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

#[cfg(test)]
mod tests {
    use super::{MIGRATIONS, checksum};

    /// Applied migrations are byte-immutable: `verify_migration` compares the
    /// ledger's stored checksum against the embedded SQL, so ANY edit to a
    /// shipped migration file — even a comment or whitespace change — bricks
    /// every existing database with "checksum drift" at boot. The 2026-08-12
    /// repository hoist rewrote a doc path inside 0013's comment and broke
    /// exactly this way. New schema changes go in a NEW migration file, and
    /// its checksum gets appended here in the same commit.
    #[test]
    fn shipped_migrations_are_byte_immutable() {
        const SHIPPED: &[(i64, &str)] = &[
            (
                1,
                "92b58c89acc0de517e594c418596abfe84947976a774250eacebb49e34ec3e23",
            ),
            (
                2,
                "5ef489b5792913a5f3a19f3e6b35c0eab81b7eba6522c86ea458a00d4fa5221f",
            ),
            (
                3,
                "2868267fb5d01685fab029b71ceb3cf81c64c2b7e4a20bb581acc9b0de61da4d",
            ),
            (
                4,
                "ef42f83abf025d0f8f7738d1128fd6cf5a7bfc7a801ea10676a6acdba000285e",
            ),
            (
                5,
                "3d70092245a75dfce55f1d7ad1976cb4706d87dd81cdd81459f5f921aa4b3437",
            ),
            (
                6,
                "e2755093f801ab332a6192f1ec9c01b46cc7673b1f7b817e32113f46a80998d2",
            ),
            (
                7,
                "ec28d007d9a471b4e97856d9be7fc36cd3a0af257a879d3d2ef8cdef9921943e",
            ),
            (
                8,
                "2de6362349327cfad8b845869aba0105b673070a73a14785efed8a24ec5fd99f",
            ),
            (
                9,
                "1894937a6f2af02302a298864e8b2690897e1d1c23c70eda39a209c16351d491",
            ),
            (
                10,
                "ae59eddb2136d99b2e699d944481572a22f1de97db6ece50681f8b0fe5bf607d",
            ),
            (
                11,
                "f1fc816a87bde3beab29318285450ad46612b787056cebebd361f5d68acf90ca",
            ),
            (
                12,
                "6834f7973659ba720ce97720a86e54857b90e82a127dffcce3ffa64b8e474e40",
            ),
            (
                13,
                "730f5a92ef87572450d1a0485d9a24acf7bad458b32cf850622d19566d6c385d",
            ),
            (
                14,
                "77e4869ca89cc09a68dd2406a5b6703822a726c9a23db07aa31d87e886e1cc30",
            ),
            (
                15,
                "673715ccb46d2a1e71cc845baed1589bfc44f1e34141fa56237aa3ab74ffcbd7",
            ),
            (
                16,
                "9d8f5b49f2366da48ec595071c80b003bf53e4f5890783799bb778e469de88db",
            ),
            (
                17,
                "7b9d76fd971a25795d953398266d0d7c94ed71db831951dc8a75e991b4c8c993",
            ),
            (
                18,
                "290198b06cf8a02ef4300a7c9599ec696c6b05f0dfdf4c90e22731f569c20725",
            ),
            (
                19,
                "c03e157ab01c7e970ec42663c4c22d1e934e3eb8aaff44368700cda1219f9db2",
            ),
            (
                20,
                "ed5f96b13b1e02fbfe941bdf886fe89b05e298b459f163229b3352e9c709122c",
            ),
            (
                21,
                "5e5d566989fd590cbc757ce8aca82a84d1c5a064c5e714a9eac1f06b954fe3a6",
            ),
            (
                22,
                "12ed51da7e6ca5c725ffd407edc6ba033369005011c1660faf28f7cc68b0ffb5",
            ),
        ];
        assert_eq!(MIGRATIONS.len(), SHIPPED.len(), "append new checksums here");
        for (migration, (version, shipped)) in MIGRATIONS.iter().zip(SHIPPED) {
            assert_eq!(migration.version, *version);
            assert_eq!(
                checksum(migration.sql),
                *shipped,
                "migration {} ({}) changed after shipping; add a new migration instead",
                migration.version,
                migration.name,
            );
        }
    }
}
