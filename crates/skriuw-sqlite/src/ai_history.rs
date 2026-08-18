use rusqlite::{Connection, Row, TransactionBehavior, params, types::Value};
use skriuw_domain::{
    AiHistoryRetention, AiHistorySettings, AiProviderErrorCategory, AiRunFilter, AiRunPrompts,
    AiRunRecord, AiRunState, AiRunTokens, AiTokenSource, AiUsageAggregate,
};
use skriuw_storage::{AiRunHistory, StorageError};

use crate::SqliteWorkspace;
use crate::error::backend;

const SELECT_RUN_COLUMNS: &str = "run_id, started_at_ms, origin, provider_id, model_id, \
     system_prompt, user_prompt, state, error_category, duration_ms, input_tokens, \
     output_tokens, token_source, cost_micros";

impl AiRunHistory for SqliteWorkspace {
    fn ai_history_settings(&self) -> Result<AiHistorySettings, StorageError> {
        let connection = self.lock()?;
        read_settings(&connection)
    }

    fn set_ai_history_settings(
        &self,
        settings: AiHistorySettings,
    ) -> Result<AiHistorySettings, StorageError> {
        let settings = settings.clamped();
        let connection = self.lock()?;
        connection
            .execute(
                "UPDATE ai_history_settings SET retain_prompts = ?1, max_runs = ?2, \
                 max_age_days = ?3 WHERE id = 1",
                params![
                    i64::from(settings.retain_prompts),
                    i64::from(settings.retention.max_runs),
                    i64::from(settings.retention.max_age_days),
                ],
            )
            .map_err(backend)?;
        Ok(settings)
    }

    fn record_ai_run(&self, record: &AiRunRecord, now_ms: i64) -> Result<(), StorageError> {
        record
            .validate()
            .map_err(|error| StorageError::InvalidOperation(error.to_string()))?;
        let mut connection = self.lock()?;
        with_secure_delete(&mut connection, |connection| {
            append_run(connection, record, now_ms)
        })
    }

    fn prune_ai_runs(&self, now_ms: i64) -> Result<u32, StorageError> {
        let mut connection = self.lock()?;
        with_secure_delete(&mut connection, |connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(backend)?;
            let settings = read_settings(&transaction)?;
            let removed = prune_in(&transaction, settings.retention, now_ms)?;
            transaction.commit().map_err(backend)?;
            Ok(removed)
        })
    }

    fn list_ai_runs(&self, filter: &AiRunFilter) -> Result<Vec<AiRunRecord>, StorageError> {
        let mut conditions = Vec::new();
        let mut arguments: Vec<Value> = Vec::new();
        if let Some(provider_id) = &filter.provider_id {
            arguments.push(Value::Text(provider_id.clone()));
            conditions.push(format!("provider_id = ?{}", arguments.len()));
        }
        if let Some(model_id) = &filter.model_id {
            arguments.push(Value::Text(model_id.clone()));
            conditions.push(format!("model_id = ?{}", arguments.len()));
        }
        if let Some(state) = filter.state {
            arguments.push(Value::Text(state.as_str().to_owned()));
            conditions.push(format!("state = ?{}", arguments.len()));
        }
        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", conditions.join(" AND "))
        };
        arguments.push(Value::Integer(i64::from(filter.page_size())));
        let sql = format!(
            "SELECT {SELECT_RUN_COLUMNS} FROM ai_run_history{where_clause} \
             ORDER BY started_at_ms DESC, run_id DESC LIMIT ?{}",
            arguments.len()
        );

        let connection = self.lock()?;
        let mut statement = connection.prepare(&sql).map_err(backend)?;
        let rows = statement
            .query_map(rusqlite::params_from_iter(arguments), read_run)
            .map_err(backend)?;
        let mut records = Vec::new();
        for row in rows {
            records.push(row.map_err(backend)?);
        }
        Ok(records)
    }

    fn aggregate_ai_usage(&self, since_ms: i64) -> Result<Vec<AiUsageAggregate>, StorageError> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT strftime('%Y-%m-%d', started_at_ms / 1000, 'unixepoch') AS day, \
                 provider_id, model_id, COUNT(*), SUM(input_tokens), SUM(output_tokens), \
                 SUM(COALESCE(cost_micros, 0)), MAX(token_source = 'estimated') \
                 FROM ai_run_history WHERE started_at_ms >= ?1 \
                 GROUP BY day, provider_id, model_id \
                 ORDER BY day DESC, provider_id ASC, model_id ASC",
            )
            .map_err(backend)?;
        let rows = statement
            .query_map(params![since_ms], |row| {
                Ok(AiUsageAggregate {
                    day: row.get::<_, String>(0)?,
                    provider_id: row.get::<_, String>(1)?,
                    model_id: row.get::<_, String>(2)?,
                    runs: u32::try_from(row.get::<_, i64>(3)?).unwrap_or(u32::MAX),
                    input_tokens: token_value(row.get::<_, i64>(4)?),
                    output_tokens: token_value(row.get::<_, i64>(5)?),
                    cost_micros: token_value(row.get::<_, i64>(6)?),
                    estimated: row.get::<_, i64>(7)? != 0,
                })
            })
            .map_err(backend)?;
        let mut aggregates = Vec::new();
        for row in rows {
            aggregates.push(row.map_err(backend)?);
        }
        Ok(aggregates)
    }

    fn clear_ai_runs(&self) -> Result<u32, StorageError> {
        let mut connection = self.lock()?;
        with_secure_delete(&mut connection, |connection| {
            let removed = connection
                .execute("DELETE FROM ai_run_history", [])
                .map_err(backend)?;
            Ok(u32::try_from(removed).unwrap_or(u32::MAX))
        })
    }
}

fn append_run(
    connection: &mut Connection,
    record: &AiRunRecord,
    now_ms: i64,
) -> Result<(), StorageError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(backend)?;
    let settings = read_settings(&transaction)?;
    let prompts = if settings.retain_prompts {
        record.prompts.clone()
    } else {
        None
    };
    transaction
        .execute(
            "INSERT OR REPLACE INTO ai_run_history (run_id, started_at_ms, origin, \
                 provider_id, model_id, system_prompt, user_prompt, state, error_category, \
                 duration_ms, input_tokens, output_tokens, token_source, cost_micros) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                record.run_id,
                record.started_at_ms,
                record.origin,
                record.provider_id,
                record.model_id,
                prompts
                    .as_ref()
                    .map(|prompts| prompts.system_prompt.clone()),
                prompts.as_ref().map(|prompts| prompts.user_prompt.clone()),
                record.state.as_str(),
                record.error_category.map(category_text),
                i64::from(record.duration_ms),
                token_column(record.tokens.input_tokens),
                token_column(record.tokens.output_tokens),
                record.tokens.source.as_str(),
                record.cost_micros.map(token_column),
            ],
        )
        .map_err(backend)?;
    prune_in(&transaction, settings.retention, now_ms)?;
    transaction.commit().map_err(backend)
}

/// Overwrites freed pages instead of leaving deleted prompt text readable in
/// the database file, and truncates the write-ahead log so the same text is
/// not still sitting in the sidecar afterwards. Both pragmas are refused
/// inside a transaction, so this wraps the whole unit of work rather than
/// running within it.
fn with_secure_delete<T>(
    connection: &mut Connection,
    work: impl FnOnce(&mut Connection) -> Result<T, StorageError>,
) -> Result<T, StorageError> {
    connection
        .pragma_update(None, "secure_delete", "ON")
        .map_err(backend)?;
    let result = work(connection);
    let restored = connection.pragma_update(None, "secure_delete", "OFF");
    let value = result?;
    restored.map_err(backend)?;
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(backend)?;
    Ok(value)
}

fn read_settings(connection: &Connection) -> Result<AiHistorySettings, StorageError> {
    connection
        .query_row(
            "SELECT retain_prompts, max_runs, max_age_days FROM ai_history_settings WHERE id = 1",
            [],
            |row| {
                Ok(AiHistorySettings {
                    retain_prompts: row.get::<_, i64>(0)? != 0,
                    retention: AiHistoryRetention {
                        max_runs: u32::try_from(row.get::<_, i64>(1)?).unwrap_or(u32::MAX),
                        max_age_days: u32::try_from(row.get::<_, i64>(2)?).unwrap_or(u32::MAX),
                    },
                })
            },
        )
        .map(AiHistorySettings::clamped)
        .map_err(backend)
}

fn prune_in(
    connection: &Connection,
    retention: AiHistoryRetention,
    now_ms: i64,
) -> Result<u32, StorageError> {
    let retention = retention.clamped();
    let expired = connection
        .execute(
            "DELETE FROM ai_run_history WHERE started_at_ms < ?1",
            params![retention.oldest_kept_ms(now_ms)],
        )
        .map_err(backend)?;
    let overflow = connection
        .execute(
            "DELETE FROM ai_run_history WHERE run_id NOT IN (\
             SELECT run_id FROM ai_run_history ORDER BY started_at_ms DESC, run_id DESC \
             LIMIT ?1)",
            params![i64::from(retention.max_runs)],
        )
        .map_err(backend)?;
    Ok(u32::try_from(expired.saturating_add(overflow)).unwrap_or(u32::MAX))
}

fn read_run(row: &Row<'_>) -> rusqlite::Result<AiRunRecord> {
    let system_prompt: Option<String> = row.get(5)?;
    let user_prompt: Option<String> = row.get(6)?;
    let state: String = row.get(7)?;
    let error_category: Option<String> = row.get(8)?;
    let token_source: String = row.get(12)?;
    let cost_micros: Option<i64> = row.get(13)?;
    Ok(AiRunRecord {
        run_id: row.get(0)?,
        started_at_ms: row.get(1)?,
        origin: row.get(2)?,
        provider_id: row.get(3)?,
        model_id: row.get(4)?,
        prompts: match (system_prompt, user_prompt) {
            (Some(system_prompt), Some(user_prompt)) => Some(AiRunPrompts {
                system_prompt,
                user_prompt,
            }),
            _ => None,
        },
        state: AiRunState::parse(&state).unwrap_or(AiRunState::Failed),
        error_category: error_category.as_deref().and_then(parse_category),
        duration_ms: u32::try_from(row.get::<_, i64>(9)?).unwrap_or(u32::MAX),
        tokens: AiRunTokens {
            input_tokens: token_value(row.get::<_, i64>(10)?),
            output_tokens: token_value(row.get::<_, i64>(11)?),
            source: AiTokenSource::parse(&token_source).unwrap_or(AiTokenSource::Estimated),
        },
        cost_micros: cost_micros.map(token_value),
    })
}

/// SQLite integers are signed, and every count crossing this boundary is
/// already bounded far below `i64::MAX` by the domain validator.
fn token_column(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn token_value(value: i64) -> u64 {
    u64::try_from(value).unwrap_or(0)
}

fn category_text(category: AiProviderErrorCategory) -> String {
    serde_json::to_value(category)
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_else(|| "internal_failure".to_owned())
}

fn parse_category(text: &str) -> Option<AiProviderErrorCategory> {
    serde_json::from_value(serde_json::Value::String(text.to_owned())).ok()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use skriuw_domain::{
        AiHistoryRetention, AiHistorySettings, AiProviderErrorCategory, AiRunFilter, AiRunPrompts,
        AiRunRecord, AiRunState, AiRunTokens, AiTokenSource,
    };
    use skriuw_storage::{AiRunHistory, WorkspaceMaintenance, WorkspaceSyncQueue};
    use tempfile::tempdir;

    use crate::SqliteWorkspace;

    const DAY_MS: i64 = 86_400_000;

    fn record(run_id: &str, started_at_ms: i64, state: AiRunState) -> AiRunRecord {
        AiRunRecord {
            run_id: run_id.to_owned(),
            started_at_ms,
            origin: "playground".into(),
            provider_id: "groq".into(),
            model_id: "openai/gpt-oss-120b".into(),
            prompts: Some(AiRunPrompts {
                system_prompt: "be terse".into(),
                user_prompt: format!("unmistakable-prompt-{run_id}"),
            }),
            state,
            error_category: match state {
                AiRunState::Failed => Some(AiProviderErrorCategory::RateLimited),
                _ => None,
            },
            duration_ms: 120,
            tokens: AiRunTokens {
                input_tokens: 1_000,
                output_tokens: 200,
                source: AiTokenSource::Provider,
            },
            cost_micros: Some(270),
        }
    }

    #[test]
    fn records_every_terminal_state_and_filters_by_it() {
        let workspace = SqliteWorkspace::open_in_memory().expect("open");
        for (index, state) in [
            AiRunState::Done,
            AiRunState::Cancelled,
            AiRunState::TimedOut,
            AiRunState::Failed,
        ]
        .into_iter()
        .enumerate()
        {
            let started = 1_000 + i64::try_from(index).unwrap_or(0);
            workspace
                .record_ai_run(&record(&format!("run-{index}"), started, state), 10_000)
                .expect("record");
        }

        let all = workspace
            .list_ai_runs(&AiRunFilter::default())
            .expect("list");
        assert_eq!(all.len(), 4);

        for state in [
            AiRunState::Done,
            AiRunState::Cancelled,
            AiRunState::TimedOut,
            AiRunState::Failed,
        ] {
            let filtered = workspace
                .list_ai_runs(&AiRunFilter {
                    state: Some(state),
                    ..AiRunFilter::default()
                })
                .expect("list");
            assert_eq!(filtered.len(), 1, "{state:?}");
            assert_eq!(filtered[0].state, state);
        }

        let failed = workspace
            .list_ai_runs(&AiRunFilter {
                state: Some(AiRunState::Failed),
                ..AiRunFilter::default()
            })
            .expect("list");
        assert_eq!(
            failed[0].error_category,
            Some(AiProviderErrorCategory::RateLimited)
        );

        let other_provider = workspace
            .list_ai_runs(&AiRunFilter {
                provider_id: Some("gemini".into()),
                ..AiRunFilter::default()
            })
            .expect("list");
        assert!(other_provider.is_empty());
    }

    #[test]
    fn retention_prunes_by_age_and_count() {
        let workspace = SqliteWorkspace::open_in_memory().expect("open");
        workspace
            .set_ai_history_settings(AiHistorySettings {
                retain_prompts: true,
                retention: AiHistoryRetention {
                    max_runs: 3,
                    max_age_days: 2,
                },
            })
            .expect("settings");

        let now = 100 * DAY_MS;
        workspace
            .record_ai_run(&record("ancient", now - 10 * DAY_MS, AiRunState::Done), now)
            .expect("record");
        assert!(
            workspace
                .list_ai_runs(&AiRunFilter::default())
                .expect("list")
                .is_empty(),
            "a run older than the age cap must not survive its own write"
        );

        for index in 0..5 {
            workspace
                .record_ai_run(
                    &record(&format!("run-{index}"), now + index, AiRunState::Done),
                    now + index,
                )
                .expect("record");
        }
        let kept = workspace
            .list_ai_runs(&AiRunFilter::default())
            .expect("list");
        assert_eq!(kept.len(), 3);
        assert_eq!(kept[0].run_id, "run-4");
        assert_eq!(kept[2].run_id, "run-2");
    }

    #[test]
    fn metadata_only_mode_never_writes_prompt_text() {
        let workspace = SqliteWorkspace::open_in_memory().expect("open");
        workspace
            .set_ai_history_settings(AiHistorySettings {
                retain_prompts: false,
                ..AiHistorySettings::default()
            })
            .expect("settings");
        workspace
            .record_ai_run(&record("run-1", 1_000, AiRunState::Done), 1_000)
            .expect("record");

        let runs = workspace
            .list_ai_runs(&AiRunFilter::default())
            .expect("list");
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].prompts, None);
        assert_eq!(runs[0].tokens.input_tokens, 1_000);
    }

    #[test]
    fn clearing_history_leaves_no_prompt_text_in_the_database_file() {
        let directory = tempdir().expect("tempdir");
        let path = directory.path().join("skriuw.db");
        let workspace = SqliteWorkspace::open(&path).expect("open");
        workspace
            .record_ai_run(&record("run-1", 1_000, AiRunState::Done), 1_000)
            .expect("record");

        assert_eq!(workspace.clear_ai_runs().expect("clear"), 1);
        assert!(
            workspace
                .list_ai_runs(&AiRunFilter::default())
                .expect("list")
                .is_empty()
        );

        for suffix in ["", "-wal", "-shm"] {
            let candidate = directory.path().join(format!("skriuw.db{suffix}"));
            let Ok(bytes) = fs::read(&candidate) else {
                continue;
            };
            assert!(
                !contains(&bytes, b"unmistakable-prompt-run-1"),
                "prompt text survived in {}",
                candidate.display()
            );
        }
    }

    #[test]
    fn aggregates_group_by_day_provider_and_model_and_flag_estimates() {
        let workspace = SqliteWorkspace::open_in_memory().expect("open");
        let day_one = 40 * DAY_MS;
        let day_two = 41 * DAY_MS;
        workspace
            .record_ai_run(&record("run-1", day_one, AiRunState::Done), day_two)
            .expect("record");
        workspace
            .record_ai_run(&record("run-2", day_one + 1, AiRunState::Done), day_two)
            .expect("record");

        let mut estimated = record("run-3", day_two, AiRunState::Cancelled);
        estimated.tokens.source = AiTokenSource::Estimated;
        workspace
            .record_ai_run(&estimated, day_two)
            .expect("record");

        let aggregates = workspace.aggregate_ai_usage(0).expect("aggregate");
        assert_eq!(aggregates.len(), 2);
        assert_eq!(aggregates[0].day, "1970-02-11");
        assert!(aggregates[0].estimated);
        assert_eq!(aggregates[0].runs, 1);
        assert_eq!(aggregates[1].day, "1970-02-10");
        assert!(!aggregates[1].estimated);
        assert_eq!(aggregates[1].runs, 2);
        assert_eq!(aggregates[1].input_tokens, 2_000);
        assert_eq!(aggregates[1].output_tokens, 400);
        assert_eq!(aggregates[1].cost_micros, 540);

        let recent = workspace.aggregate_ai_usage(day_two).expect("aggregate");
        assert_eq!(recent.len(), 1);
    }

    #[test]
    fn history_never_reaches_an_archive_or_the_sync_queue() {
        let workspace = SqliteWorkspace::open_in_memory().expect("open");
        workspace
            .record_ai_run(&record("run-1", 1_000, AiRunState::Done), 1_000)
            .expect("record");

        let archive = workspace.export_archive(2_000).expect("archive");
        let serialized = serde_json::to_string(&archive).expect("serialize archive");
        assert!(!serialized.contains("unmistakable-prompt"));
        assert!(!serialized.contains("ai_run_history"));

        assert!(
            !workspace
                .has_pending_sync_operations()
                .expect("pending sync"),
            "a recorded run must not enqueue a sync operation"
        );
    }

    fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack
            .windows(needle.len())
            .any(|window| window == needle)
    }
}
