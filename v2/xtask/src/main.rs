use std::{
    env,
    error::Error,
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
};

use schemars::{JsonSchema, schema_for};
use skriuw_domain::{OperationAck, SearchHit, WorkspaceOperationEnvelope, WorkspaceSnapshot};

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
        .ok_or("xtask must live below repository root")?
        .to_path_buf();
    let output = root.join("generated/contracts");

    write_schema::<WorkspaceOperationEnvelope>(&output, "workspace-operation.schema.json", check)?;
    write_schema::<WorkspaceSnapshot>(&output, "workspace-snapshot.schema.json", check)?;
    write_schema::<OperationAck>(&output, "operation-ack.schema.json", check)?;
    write_schema::<SearchHit>(&output, "search-hit.schema.json", check)?;
    Ok(())
}

fn write_schema<T: JsonSchema>(
    directory: &Path,
    filename: &str,
    check: bool,
) -> Result<(), Box<dyn Error>> {
    let mut expected = serde_json::to_string_pretty(&schema_for!(T))?;
    expected.push('\n');
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
