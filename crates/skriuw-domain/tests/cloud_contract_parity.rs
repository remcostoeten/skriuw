//! The cloud service validates the same wire contracts in TypeScript. Its
//! version lists are hand-maintained, and a client that outgrows them has
//! every checkpoint publication rejected, so they are held to the Rust source
//! of truth here.

use std::fs;
use std::path::Path;

use skriuw_domain::{
    SUPPORTED_ARCHIVE_VERSIONS, SUPPORTED_SYNC_PROTOCOL_VERSIONS, WORKSPACE_ARCHIVE_VERSION,
    WORKSPACE_CHECKPOINT_VERSION, WORKSPACE_SYNC_PROTOCOL_VERSION,
};

fn service_contracts() -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../services/sync/src/contracts.ts");
    fs::read_to_string(&path).unwrap_or_else(|error| panic!("read {}: {error}", path.display()))
}

fn exported_value<'a>(source: &'a str, name: &str) -> &'a str {
    let prefix = format!("export const {name}");
    let line = source
        .lines()
        .find(|line| line.starts_with(&prefix))
        .unwrap_or_else(|| panic!("services/sync/src/contracts.ts no longer exports {name}"));
    let (_, value) = line
        .split_once(" = ")
        .unwrap_or_else(|| panic!("{name} is not a simple assignment"));
    value.trim_end_matches(';').trim()
}

fn number(source: &str, name: &str) -> u16 {
    exported_value(source, name)
        .parse()
        .unwrap_or_else(|error| panic!("{name} is not a number literal: {error}"))
}

fn number_list(source: &str, name: &str) -> Vec<u16> {
    exported_value(source, name)
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split(',')
        .map(|entry| {
            entry
                .trim()
                .parse()
                .unwrap_or_else(|error| panic!("{name} holds a non-number entry: {error}"))
        })
        .collect()
}

#[test]
fn the_cloud_accepts_every_archive_version_the_client_can_write() {
    let source = service_contracts();
    let accepted = number_list(&source, "SUPPORTED_ARCHIVE_VERSIONS");
    assert_eq!(accepted, SUPPORTED_ARCHIVE_VERSIONS);
    assert!(accepted.contains(&WORKSPACE_ARCHIVE_VERSION));
}

#[test]
fn the_cloud_speaks_the_client_checkpoint_and_sync_protocol_versions() {
    let source = service_contracts();
    assert_eq!(
        number(&source, "WORKSPACE_CHECKPOINT_VERSION"),
        WORKSPACE_CHECKPOINT_VERSION
    );
    assert_eq!(
        number(&source, "WORKSPACE_SYNC_PROTOCOL_VERSION"),
        WORKSPACE_SYNC_PROTOCOL_VERSION
    );
    assert_eq!(
        number_list(&source, "SUPPORTED_SYNC_PROTOCOL_VERSIONS"),
        SUPPORTED_SYNC_PROTOCOL_VERSIONS
    );
}
