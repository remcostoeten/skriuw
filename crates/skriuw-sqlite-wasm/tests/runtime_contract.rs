use std::{
    fs,
    path::PathBuf,
    process,
    time::{SystemTime, UNIX_EPOCH},
};

use skriuw_fixtures::{FixtureSpec, TreeShape, generate_workspace_fixture};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_sqlite_wasm::{
    BrowserStorageErrorCode, BrowserWorkerCommand, BrowserWorkerOutcome, BrowserWorkerRequest,
    BrowserWorkerRuntime, BrowserWorkerValue, WORKER_PROTOCOL_VERSION,
};
use skriuw_storage::{WorkspaceMaintenance, WorkspaceStorage};

const EXPORTED_AT: i64 = 1_800_000_000_000;

fn request(request_id: u64, command: BrowserWorkerCommand) -> BrowserWorkerRequest {
    BrowserWorkerRequest {
        protocol_version: WORKER_PROTOCOL_VERSION,
        request_id,
        command,
    }
}

fn fixture() -> skriuw_fixtures::WorkspaceFixture {
    generate_workspace_fixture(FixtureSpec {
        shape: TreeShape::Mixed,
        note_count: 48,
    })
}

fn temporary_database(label: &str) -> TemporaryDatabase {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after epoch")
        .as_nanos();
    TemporaryDatabase {
        path: std::env::temp_dir().join(format!(
            "skriuw-wasm-{label}-{}-{nonce}.sqlite3",
            process::id()
        )),
    }
}

struct TemporaryDatabase {
    path: PathBuf,
}

impl Drop for TemporaryDatabase {
    fn drop(&mut self) {
        for suffix in ["", "-wal", "-shm"] {
            let path = PathBuf::from(format!("{}{}", self.path.display(), suffix));
            let _ = fs::remove_file(path);
        }
    }
}

#[test]
fn edit_close_and_reopen_preserves_the_workspace() {
    let database = temporary_database("reopen");
    let fixture = fixture();
    let expected = {
        let backend = SqliteWorkspace::open(&database.path).expect("open fresh database");
        let mut runtime = BrowserWorkerRuntime::new();
        runtime.initialize(backend).expect("initialize runtime");
        for (index, operations) in fixture.operation_batches(64).into_iter().enumerate() {
            let response = runtime.dispatch(request(
                index as u64 + 1,
                BrowserWorkerCommand::ApplyOperations { operations },
            ));
            assert!(matches!(
                response.outcome,
                BrowserWorkerOutcome::Ok(BrowserWorkerValue::Operation(_))
            ));
        }
        let response = runtime.dispatch(request(100, BrowserWorkerCommand::Bootstrap));
        let BrowserWorkerOutcome::Ok(BrowserWorkerValue::Bootstrap(snapshot)) = response.outcome
        else {
            panic!("expected bootstrap snapshot");
        };
        runtime.dispatch(request(101, BrowserWorkerCommand::Close));
        *snapshot
    };

    let reopened = SqliteWorkspace::open(&database.path).expect("reopen database");
    assert_eq!(reopened.bootstrap().expect("reopened snapshot"), expected);
}

#[test]
fn validated_archive_replacement_is_atomic_and_portable() {
    let source = SqliteWorkspace::open_in_memory().expect("source database");
    let fixture = fixture();
    for operations in fixture.operation_batches(64) {
        source.apply_operations(&operations).expect("apply fixture");
    }
    let archive = source.export_archive(EXPORTED_AT).expect("export archive");

    let target = SqliteWorkspace::open_in_memory().expect("target database");
    let mut runtime = BrowserWorkerRuntime::new();
    runtime.initialize(target).expect("initialize runtime");
    let response = runtime.dispatch(request(
        1,
        BrowserWorkerCommand::ReplaceFromArchive {
            archive: Box::new(archive.clone()),
        },
    ));
    assert!(matches!(
        response.outcome,
        BrowserWorkerOutcome::Ok(BrowserWorkerValue::ImportSummary(_))
    ));
    let response = runtime.dispatch(request(
        2,
        BrowserWorkerCommand::ExportArchive {
            exported_at: EXPORTED_AT,
        },
    ));
    let BrowserWorkerOutcome::Ok(BrowserWorkerValue::Archive(actual)) = response.outcome else {
        panic!("expected archive");
    };
    assert_eq!(*actual, archive);
}

#[test]
fn invalid_archive_is_rejected_before_storage_mutation() {
    let backend = SqliteWorkspace::open_in_memory().expect("open database");
    let before = backend.bootstrap().expect("bootstrap before");
    let mut archive = backend.export_archive(EXPORTED_AT).expect("export archive");
    archive.archive_version += 1;

    let mut runtime = BrowserWorkerRuntime::new();
    runtime.initialize(backend).expect("initialize runtime");
    let response = runtime.dispatch(request(
        1,
        BrowserWorkerCommand::ReplaceFromArchive {
            archive: Box::new(archive),
        },
    ));
    assert!(matches!(
        response.outcome,
        BrowserWorkerOutcome::Error(error)
            if error.code == BrowserStorageErrorCode::InvalidRequest
    ));
    let response = runtime.dispatch(request(2, BrowserWorkerCommand::Bootstrap));
    let BrowserWorkerOutcome::Ok(BrowserWorkerValue::Bootstrap(after)) = response.outcome else {
        panic!("expected bootstrap");
    };
    assert_eq!(*after, before);
}
