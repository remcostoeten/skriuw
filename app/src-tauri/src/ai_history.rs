use std::{
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex, OnceLock,
        mpsc::{SyncSender, sync_channel},
    },
    thread,
};

use skriuw_domain::{
    AiCompletionRequest, AiHistorySettings, AiHistoryView, AiRunFilter, AiRunRecord, AiRunRecorder,
    AiRunSummary, AiUsageAggregate, ai_run_record,
};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::AiRunHistory;

/// How many terminalized runs may wait for the writer thread before recording
/// is skipped. AI accounting is diagnostics-class: dropping a record is
/// preferable to holding up a completion worker.
const RECORD_QUEUE_DEPTH: usize = 64;

/// Local-only AI run accounting. The connection is opened on the first record
/// or the first read, never on startup, and every durable write happens on a
/// dedicated thread so no completion, renderer, or navigation path waits for
/// it.
pub(crate) struct AiHistoryRecorder {
    database_path: PathBuf,
    storage: OnceLock<Arc<SqliteWorkspace>>,
    writer: Mutex<Option<SyncSender<AiRunRecord>>>,
    now_millis: fn() -> i64,
}

impl AiHistoryRecorder {
    pub(crate) fn new(database_path: &Path, now_millis: fn() -> i64) -> Self {
        Self {
            database_path: database_path.to_path_buf(),
            storage: OnceLock::new(),
            writer: Mutex::new(None),
            now_millis,
        }
    }

    fn storage(&self) -> Result<Arc<SqliteWorkspace>, String> {
        if let Some(storage) = self.storage.get() {
            return Ok(Arc::clone(storage));
        }
        let opened = Arc::new(
            SqliteWorkspace::open(&self.database_path)
                .map_err(|error| format!("open {}: {error}", self.database_path.display()))?,
        );
        let _ = self.storage.set(opened);
        self.storage
            .get()
            .cloned()
            .ok_or_else(|| "AI history storage is unavailable".to_owned())
    }

    fn writer(&self) -> Result<SyncSender<AiRunRecord>, String> {
        let mut guard = self
            .writer
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(sender) = guard.as_ref() {
            return Ok(sender.clone());
        }
        let storage = self.storage()?;
        let now_millis = self.now_millis;
        let (sender, receiver) = sync_channel::<AiRunRecord>(RECORD_QUEUE_DEPTH);
        thread::Builder::new()
            .name("skriuw-ai-history".into())
            .spawn(move || {
                for record in receiver {
                    if let Err(error) = storage.record_ai_run(&record, now_millis()) {
                        eprintln!("AI run history write failed: {error}");
                    }
                }
            })
            .map_err(|error| error.to_string())?;
        *guard = Some(sender.clone());
        Ok(sender)
    }

    pub(crate) fn settings(&self) -> Result<AiHistorySettings, String> {
        self.storage()?
            .ai_history_settings()
            .map_err(|error| error.to_string())
    }

    pub(crate) fn set_settings(
        &self,
        settings: AiHistorySettings,
    ) -> Result<AiHistorySettings, String> {
        let storage = self.storage()?;
        let applied = storage
            .set_ai_history_settings(settings)
            .map_err(|error| error.to_string())?;
        storage
            .prune_ai_runs((self.now_millis)())
            .map_err(|error| error.to_string())?;
        Ok(applied)
    }

    pub(crate) fn view(
        &self,
        filter: &AiRunFilter,
        since_ms: i64,
        pricing_as_of: Option<String>,
    ) -> Result<AiHistoryView, String> {
        let storage = self.storage()?;
        let settings = storage
            .ai_history_settings()
            .map_err(|error| error.to_string())?;
        // Runs are read before the aggregates so a run that lands between the
        // two queries can only make the totals larger than the visible list,
        // never smaller than it.
        let runs = storage
            .list_ai_runs(filter)
            .map_err(|error| error.to_string())?;
        let aggregates: Vec<AiUsageAggregate> = storage
            .aggregate_ai_usage(since_ms)
            .map_err(|error| error.to_string())?;
        Ok(AiHistoryView {
            settings,
            pricing_as_of,
            aggregates,
            runs,
        })
    }

    pub(crate) fn clear(&self) -> Result<u32, String> {
        self.storage()?
            .clear_ai_runs()
            .map_err(|error| error.to_string())
    }
}

impl AiRunRecorder for AiHistoryRecorder {
    /// Decision D2 on the application side. The SDK hands over metadata plus
    /// the request borrowed for this call only, so the prompts are copied out
    /// here — inside the callback, before anything is queued — because prompt
    /// retention is Skriuw's policy and the SDK owns no prompt field.
    /// Redaction still happens at the storage boundary.
    fn record(&self, summary: AiRunSummary, request: &AiCompletionRequest) {
        self.enqueue(ai_run_record(&summary, request));
    }
}

impl AiHistoryRecorder {
    fn enqueue(&self, record: AiRunRecord) {
        match self.writer() {
            Ok(sender) => {
                if let Err(error) = sender.try_send(record) {
                    eprintln!("AI run history queue rejected a record: {error}");
                }
            }
            Err(error) => eprintln!("AI run history is unavailable: {error}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use skriuw_domain::{
        AiCompletionParameters, AiCompletionRequest, AiHistoryRetention, AiHistorySettings,
        AiProviderErrorCategory, AiRunFilter, AiRunRecorder, AiRunState, AiRunStatus, AiRunSummary,
        AiRunTokens, AiTokenSource,
    };
    use std::{thread, time::Duration, time::Instant};
    use tempfile::tempdir;

    use super::AiHistoryRecorder;

    fn clock() -> i64 {
        1_000_000
    }

    fn summary(run_id: &str, status: AiRunStatus) -> AiRunSummary {
        AiRunSummary {
            run_id: run_id.to_owned(),
            started_at_ms: 1_000_000,
            origin: "playground".into(),
            provider_id: "fake".into(),
            model_id: "fake".into(),
            status,
            duration_ms: 5,
            tokens: AiRunTokens {
                input_tokens: 9,
                output_tokens: 3,
                source: AiTokenSource::Estimated,
            },
            cost_micros: None,
        }
    }

    fn request() -> AiCompletionRequest {
        AiCompletionRequest {
            request_id: "run-1".into(),
            provider_id: "fake".into(),
            model_id: "fake".into(),
            system_prompt: String::new(),
            user_prompt: "keep this".into(),
            prior_messages: Vec::new(),
            parameters: AiCompletionParameters::default(),
        }
    }

    #[test]
    fn opens_nothing_until_a_run_is_recorded_or_read() {
        let directory = tempdir().expect("tempdir");
        let path = directory.path().join("skriuw.db");
        let recorder = AiHistoryRecorder::new(&path, clock);

        assert!(!path.exists());

        recorder.record(summary("run-1", AiRunStatus::Done), &request());
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let view = recorder
                .view(&AiRunFilter::default(), 0, None)
                .expect("view");
            if view.runs.len() == 1 {
                assert_eq!(view.runs[0].run_id, "run-1");
                assert_eq!(view.aggregates.len(), 1);
                break;
            }
            assert!(Instant::now() < deadline, "the record was never written");
            thread::sleep(Duration::from_millis(10));
        }

        assert_eq!(recorder.clear().expect("clear"), 1);
        assert!(
            recorder
                .view(&AiRunFilter::default(), 0, None)
                .expect("view")
                .runs
                .is_empty()
        );
    }

    /// The D2 proof on Skriuw's side: prompts survive the port when retention
    /// is on and never reach storage when it is off, and a failed run keeps its
    /// category through the status mapping.
    #[test]
    fn history_retains_or_redacts_prompts_and_maps_every_status() {
        for (retain_prompts, expected_prompt) in [(true, Some("keep this")), (false, None)] {
            let directory = tempdir().expect("tempdir");
            let recorder = AiHistoryRecorder::new(&directory.path().join("skriuw.db"), clock);
            recorder
                .set_settings(AiHistorySettings {
                    retain_prompts,
                    retention: AiHistoryRetention::default(),
                })
                .expect("settings");

            recorder.record(
                summary(
                    "run-1",
                    AiRunStatus::ProviderError {
                        category: AiProviderErrorCategory::MalformedResponse,
                    },
                ),
                &request(),
            );

            let run = await_run(&recorder);
            assert_eq!(run.state, AiRunState::Failed);
            assert_eq!(
                run.error_category,
                Some(AiProviderErrorCategory::MalformedResponse)
            );
            assert_eq!(
                run.prompts
                    .as_ref()
                    .map(|prompts| prompts.user_prompt.as_str()),
                expected_prompt,
                "retain_prompts = {retain_prompts}"
            );
        }
    }

    fn await_run(recorder: &AiHistoryRecorder) -> skriuw_domain::AiRunRecord {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let view = recorder
                .view(&AiRunFilter::default(), 0, None)
                .expect("view");
            if let Some(run) = view.runs.first() {
                return run.clone();
            }
            assert!(Instant::now() < deadline, "the record was never written");
            thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn settings_round_trip_and_clamp() {
        let directory = tempdir().expect("tempdir");
        let recorder = AiHistoryRecorder::new(&directory.path().join("skriuw.db"), clock);

        let applied = recorder
            .set_settings(AiHistorySettings {
                retain_prompts: false,
                retention: AiHistoryRetention {
                    max_runs: 0,
                    max_age_days: 0,
                },
            })
            .expect("set settings");

        assert!(!applied.retain_prompts);
        assert_eq!(applied.retention.max_runs, 1);
        assert_eq!(applied.retention.max_age_days, 1);
        assert_eq!(recorder.settings().expect("settings"), applied);
    }
}
