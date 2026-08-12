use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use serde::Serialize;
use skriuw_domain::WorkspaceOperation;
use skriuw_fixtures::{
    FixtureMetadata, WorkspaceFixture, canonical_specs, fixture_digest, generate_workspace_fixture,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectedNode<'a> {
    id: &'a str,
    parent_id: Option<&'a str>,
    kind: &'static str,
    title: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeProjection<'a> {
    metadata: &'a FixtureMetadata,
    operations_digest: String,
    active_note_id: Option<&'a str>,
    nodes: Vec<ProjectedNode<'a>>,
}

fn project(fixture: &WorkspaceFixture) -> TreeProjection<'_> {
    let mut nodes = Vec::with_capacity(fixture.metadata.node_count);
    let mut active_note_id = None;
    for envelope in &fixture.operations {
        match &envelope.operation {
            WorkspaceOperation::CreateFolder {
                id,
                title,
                placement,
                ..
            } => nodes.push(ProjectedNode {
                id,
                parent_id: placement.parent_id.as_deref(),
                kind: "folder",
                title,
            }),
            WorkspaceOperation::CreateNote {
                id,
                title,
                placement,
                ..
            } => nodes.push(ProjectedNode {
                id,
                parent_id: placement.parent_id.as_deref(),
                kind: "note",
                title,
            }),
            WorkspaceOperation::SetActiveNote { note_id } => {
                active_note_id = note_id.as_deref();
            }
            _ => {}
        }
    }
    TreeProjection {
        metadata: &fixture.metadata,
        operations_digest: fixture_digest(fixture),
        active_note_id,
        nodes,
    }
}

fn render(fixture: &WorkspaceFixture) -> Vec<u8> {
    let projection = project(fixture);
    assert_eq!(projection.nodes.len(), fixture.metadata.node_count);
    serde_json::to_vec(&projection).expect("tree projection serializes to JSON")
}

fn main() -> ExitCode {
    let Some(output_dir) = env::args().nth(1).map(PathBuf::from) else {
        eprintln!("usage: export_tree_projection <output-dir>");
        return ExitCode::FAILURE;
    };
    fs::create_dir_all(&output_dir).expect("output directory is writable");

    for spec in canonical_specs() {
        let fixture = generate_workspace_fixture(spec);
        let serialized = render(&fixture);
        assert_eq!(serialized, render(&generate_workspace_fixture(spec)));
        let path = output_dir.join(format!("{}.json", fixture.metadata.name));
        fs::write(&path, &serialized).expect("projection file is writable");
        println!(
            "{} digest={} nodes={} bytes={}",
            fixture.metadata.name,
            fixture_digest(&fixture),
            fixture.metadata.node_count,
            serialized.len()
        );
    }
    ExitCode::SUCCESS
}
