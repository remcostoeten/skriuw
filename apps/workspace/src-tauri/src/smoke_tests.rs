use crate::maintenance;
use crate::state::{history_repository_path, now_millis};
use skriuw_domain::{HistoryHeader, NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope};
use skriuw_history::HistoryReader;
use skriuw_history_git::GitHistoryMaterializer;
use skriuw_sqlite::SqliteWorkspace;
use skriuw_storage::{HistoryQueue, WorkspaceStorage};
use std::{
    fs,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::Duration,
};
use tempfile::tempdir;

#[test]
fn drains_pending_history_and_reads_it_back() {
    let dir = tempdir().expect("tempdir");
    let db_path = dir.path().join("workspace.db");
    let repo_path = history_repository_path(&db_path);

    {
        let storage = SqliteWorkspace::open(&db_path).expect("open db");
        storage
            .apply_operations(&[WorkspaceOperationEnvelope::v1(
                WorkspaceOperation::CreateNote {
                    id: "note-1".into(),
                    title: "Smoke".into(),
                    placement: NodePlacement::last(None),
                    document_json: serde_json::json!({"type": "doc", "content": []}),
                    markdown: "# Smoke".into(),
                    at: 1,
                },
            )])
            .expect("create note");
    }

    let (published, received) = mpsc::sync_channel(1);
    let drain = maintenance::spawn_history_drain(
        &db_path,
        &repo_path,
        now_millis,
        Arc::new(move |header| {
            let _ = published.send(header);
        }),
    )
    .expect("spawn drain");
    let reader = GitHistoryMaterializer::open(&repo_path).expect("open reader");
    let published = received
        .recv_timeout(Duration::from_secs(2))
        .expect("published header");
    drain.shutdown();

    let headers = reader.list_headers().expect("list headers");
    assert_eq!(headers.len(), 1);
    assert_eq!(published, headers[0]);
    let snapshot = SqliteWorkspace::open(&db_path)
        .expect("open cache")
        .bootstrap()
        .expect("read cache");
    assert_eq!(snapshot.history_headers, [published]);
    let version = reader
        .read_version("note-1", &headers[0].version_id)
        .expect("read version");
    assert_eq!(version.markdown, "# Smoke");
}

#[test]
fn git_failure_preserves_retry_without_publishing() {
    let dir = tempdir().expect("tempdir");
    let db_path = dir.path().join("workspace.db");
    let repo_path = history_repository_path(&db_path);
    let storage = SqliteWorkspace::open(&db_path).expect("open db");
    storage
        .apply_operations(&[WorkspaceOperationEnvelope::v1(
            WorkspaceOperation::CreateNote {
                id: "note-1".into(),
                title: "Smoke".into(),
                placement: NodePlacement::last(None),
                document_json: serde_json::json!({"type": "doc", "content": []}),
                markdown: "# Smoke".into(),
                at: 1,
            },
        )])
        .expect("create note");
    GitHistoryMaterializer::open(&repo_path).expect("initialize history");
    let index_path = repo_path.join(".git").join("index");
    if index_path.exists() {
        fs::remove_file(&index_path).expect("remove index");
    }
    fs::create_dir(&index_path).expect("block index creation");
    let publications = Arc::new(Mutex::new(Vec::<HistoryHeader>::new()));
    let captured = Arc::clone(&publications);
    let (failed, failure_received) = mpsc::sync_channel(1);
    let drain = maintenance::spawn_history_drain_observed(
        &db_path,
        &repo_path,
        now_millis,
        Arc::new(move |header| {
            captured.lock().expect("publications").push(header);
        }),
        Arc::new(move || {
            let _ = failed.send(());
        }),
    )
    .expect("spawn drain");
    failure_received
        .recv_timeout(Duration::from_secs(2))
        .expect("history failure observed after retry release");
    drain.shutdown();

    assert!(publications.lock().expect("publications").is_empty());
    let reopened = SqliteWorkspace::open(&db_path).expect("reopen db");
    assert!(
        reopened
            .claim_history_revision("retry-check", now_millis(), 30_000)
            .expect("claim deferred retry")
            .is_none()
    );
    let retry = reopened
        .claim_history_revision("retry-check", i64::MAX, 30_000)
        .expect("claim retry")
        .expect("pending retry");
    assert_eq!(retry.attempts, 2);
}

#[test]
fn history_drain_batch_stops_at_the_boundary() {
    let stop = AtomicBool::new(false);
    let mut processed = 0;
    let idle = maintenance::process_history_batch(&stop, || {
        processed += 1;
        true
    });

    assert!(!idle);
    assert_eq!(processed, 64);
}

#[test]
fn history_drain_batch_honors_shutdown_between_items() {
    let stop = AtomicBool::new(false);
    let mut processed = 0;
    let idle = maintenance::process_history_batch(&stop, || {
        processed += 1;
        stop.store(true, Ordering::Relaxed);
        true
    });

    assert!(!idle);
    assert_eq!(processed, 1);
}
