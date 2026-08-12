//! The browser adapter reaches the renderer through the worker request and
//! response protocol instead of a direct trait call. These tests prove that
//! detour is lossless against a real storage backend, so swapping the backend
//! for OPFS-backed SQLite-WASM cannot silently change renderer-visible state.

use skriuw_domain::NodeKind;
use skriuw_fixtures::{FixtureSpec, TreeShape, WorkspaceFixture, generate_workspace_fixture};
use skriuw_sqlite::SqliteWorkspace;
use skriuw_sqlite_wasm::{BrowserWorkspace, WorkerRequest, WorkerResponse};
use skriuw_storage::WorkspaceStorage;

const BATCH_SIZE: usize = 64;
const PANE_LAYOUT_JSON: &str = r#"{"mode":"split"}"#;

fn small_fixture() -> (FixtureSpec, WorkspaceFixture) {
    let spec = FixtureSpec {
        shape: TreeShape::Mixed,
        note_count: 120,
    };
    let fixture = generate_workspace_fixture(spec);
    (spec, fixture)
}

fn native_backend() -> SqliteWorkspace {
    SqliteWorkspace::open_in_memory().expect("open in-memory workspace")
}

fn dispatch(workspace: &BrowserWorkspace, request: WorkerRequest) -> WorkerResponse {
    workspace.worker().dispatch(request)
}

#[test]
fn worker_protocol_materializes_the_same_workspace_as_a_direct_backend() {
    let (_, fixture) = small_fixture();
    let batches = fixture.operation_batches(BATCH_SIZE);

    let direct = native_backend();
    for batch in &batches {
        direct.apply_operations(batch).expect("direct apply");
    }
    let expected = direct.bootstrap().expect("direct bootstrap");

    let browser = BrowserWorkspace::from_backend(native_backend());
    let response = dispatch(&browser, WorkerRequest::ApplyOperationBatches(batches));
    let acks = match response {
        WorkerResponse::OperationBatches(Ok(acks)) => acks,
        other => panic!("unexpected response: {other:?}"),
    };
    assert!(acks.iter().all(Result::is_ok), "every batch applies");

    let actual = match dispatch(&browser, WorkerRequest::Bootstrap) {
        WorkerResponse::Bootstrap(result) => *result,
        other => panic!("unexpected response: {other:?}"),
    }
    .expect("worker bootstrap");

    assert_eq!(actual, expected);
}

#[test]
fn worker_protocol_preserves_search_results() {
    let (_, fixture) = small_fixture();
    let batches = fixture.operation_batches(BATCH_SIZE);

    let direct = native_backend();
    for batch in &batches {
        direct.apply_operations(batch).expect("direct apply");
    }

    let browser = BrowserWorkspace::from_backend(native_backend());
    dispatch(&browser, WorkerRequest::ApplyOperationBatches(batches));

    for expectation in &fixture.metadata.search_expectations {
        let expected = direct
            .search(&expectation.term, fixture.metadata.note_count.max(1))
            .expect("direct search");
        let actual = match dispatch(
            &browser,
            WorkerRequest::Search {
                query: expectation.term.clone(),
                limit: fixture.metadata.note_count.max(1),
            },
        ) {
            WorkerResponse::Search(result) => result.expect("worker search"),
            other => panic!("unexpected response: {other:?}"),
        };
        assert_eq!(actual, expected, "{}", expectation.term);
    }
}

#[test]
fn worker_protocol_round_trips_renderer_layout_state() {
    let (_, fixture) = small_fixture();
    let browser = BrowserWorkspace::from_backend(native_backend());
    dispatch(
        &browser,
        WorkerRequest::ApplyOperationBatches(fixture.operation_batches(BATCH_SIZE)),
    );

    let snapshot = match dispatch(&browser, WorkerRequest::Bootstrap) {
        WorkerResponse::Bootstrap(result) => *result,
        other => panic!("unexpected response: {other:?}"),
    }
    .expect("worker bootstrap");
    let folder_ids: Vec<String> = snapshot
        .nodes
        .iter()
        .filter(|node| node.kind == NodeKind::Folder)
        .take(2)
        .map(|node| node.id.clone())
        .collect();
    assert_eq!(folder_ids.len(), 2, "fixture provides folders to expand");

    match dispatch(
        &browser,
        WorkerRequest::SaveSidebarExpansion(folder_ids.clone()),
    ) {
        WorkerResponse::Unit(result) => result.expect("save sidebar expansion"),
        other => panic!("unexpected response: {other:?}"),
    }
    match dispatch(
        &browser,
        WorkerRequest::SavePaneLayout(PANE_LAYOUT_JSON.into()),
    ) {
        WorkerResponse::Unit(result) => result.expect("save pane layout"),
        other => panic!("unexpected response: {other:?}"),
    }

    let expansion = match dispatch(&browser, WorkerRequest::LoadSidebarExpansion) {
        WorkerResponse::SidebarExpansion(result) => result.expect("load sidebar expansion"),
        other => panic!("unexpected response: {other:?}"),
    };
    let layout = match dispatch(&browser, WorkerRequest::LoadPaneLayout) {
        WorkerResponse::PaneLayout(result) => result.expect("load pane layout"),
        other => panic!("unexpected response: {other:?}"),
    };

    assert_eq!(expansion, Some(folder_ids));
    assert_eq!(layout.as_deref(), Some(PANE_LAYOUT_JSON));
}
