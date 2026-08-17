use std::{
    env,
    error::Error,
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
};

use schemars::{JsonSchema, schema_for};
use skriuw_domain::{
    AiCompletionEvent, AiCompletionRequest, ContentManifest, LocalAiError, LocalAiModel,
    LocalAiProgress, LocalAiStatus, OperationAck, SearchHit, SyncPullResponse, SyncPushRequest,
    SyncPushResponse, SyncRecoveryView, WORKSPACE_OPERATION_SYNC_POLICY_V1, WorkspaceArchive,
    WorkspaceCheckpoint, WorkspaceOperationEnvelope, WorkspaceOperationSyncPolicy,
    WorkspaceSnapshot,
};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if arguments.first().map(String::as_str) != Some("generate") {
        return Err("usage: cargo run -p xtask -- generate [--check]".into());
    }
    let check = arguments.iter().any(|argument| argument == "--check");
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .ok_or("xtask must live below repository root")?
        .to_path_buf();
    let output = root.join("contracts/generated");

    write_schema::<AiCompletionRequest>(&output, "ai-completion-request.schema.json", check)?;
    write_schema::<AiCompletionEvent>(&output, "ai-completion-event.schema.json", check)?;
    write_schema::<LocalAiStatus>(&output, "local-ai-status.schema.json", check)?;
    write_schema::<LocalAiModel>(&output, "local-ai-model.schema.json", check)?;
    write_schema::<LocalAiProgress>(&output, "local-ai-progress.schema.json", check)?;
    write_schema::<LocalAiError>(&output, "local-ai-error.schema.json", check)?;
    write_schema::<WorkspaceOperationEnvelope>(&output, "workspace-operation.schema.json", check)?;
    write_schema::<WorkspaceSnapshot>(&output, "workspace-snapshot.schema.json", check)?;
    write_schema::<WorkspaceArchive>(&output, "workspace-archive.schema.json", check)?;
    write_schema::<OperationAck>(&output, "operation-ack.schema.json", check)?;
    write_schema::<SearchHit>(&output, "search-hit.schema.json", check)?;
    write_schema::<SyncPushRequest>(&output, "sync-push-request.schema.json", check)?;
    write_schema::<SyncPushResponse>(&output, "sync-push-response.schema.json", check)?;
    write_schema::<SyncPullResponse>(&output, "sync-pull-response.schema.json", check)?;
    write_schema::<ContentManifest>(&output, "content-manifest.schema.json", check)?;
    write_schema::<WorkspaceCheckpoint>(&output, "workspace-checkpoint.schema.json", check)?;
    write_schema::<SyncRecoveryView>(&output, "sync-recovery-view.schema.json", check)?;
    write_json(
        &output,
        "workspace-operation-sync-policy-v1.json",
        WORKSPACE_OPERATION_SYNC_POLICY_V1,
        check,
    )?;
    Ok(())
}

fn write_json(
    directory: &Path,
    filename: &str,
    value: &[WorkspaceOperationSyncPolicy],
    check: bool,
) -> Result<(), Box<dyn Error>> {
    let mut expected = serde_json::to_string_pretty(value)?;
    expected.push('\n');
    write_generated(directory, filename, expected, check)
}

fn write_schema<T: JsonSchema>(
    directory: &Path,
    filename: &str,
    check: bool,
) -> Result<(), Box<dyn Error>> {
    let mut expected = serde_json::to_string_pretty(&schema_for!(T))?;
    expected.push('\n');
    write_generated(directory, filename, expected, check)
}

fn write_generated(
    directory: &Path,
    filename: &str,
    expected: String,
    check: bool,
) -> Result<(), Box<dyn Error>> {
    let path = directory.join(filename);

    if check {
        let actual = fs::read_to_string(&path)
            .map_err(|error| format!("cannot read generated file {}: {error}", path.display()))?;
        if actual != expected {
            return Err(format!(
                "generated contract is stale: {}. Run ./scripts/generate.sh",
                path.display()
            )
            .into());
        }
        return Ok(());
    }

    fs::create_dir_all(directory)?;
    fs::write(&path, expected)?;
    println!("generated {}", path.display());
    Ok(())
}
