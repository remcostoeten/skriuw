//! R-A3 is a boundary, not a convention: the mobile facade may reach domain,
//! runtime, storage, sqlite, sync and crypto and nothing else, and none of
//! those may drag in libgit2, Tauri or Ollama. A reviewer will not notice a
//! stray `git2` five crates down, so the manifests are checked here.

use std::{fs, path::Path};

const ALLOWED_WORKSPACE_CRATES: [&str; 6] = [
    "skriuw-crypto",
    "skriuw-domain",
    "skriuw-runtime",
    "skriuw-sqlite",
    "skriuw-storage",
    "skriuw-sync",
];

const ALLOWED_EXTERNAL_CRATES: [&str; 4] = ["serde", "serde_json", "thiserror", "uniffi"];

const FORBIDDEN_CRATES: [&str; 5] = [
    "git2",
    "skriuw-history-git",
    "skriuw-ai-ollama",
    "tauri",
    "reqwest",
];

fn crates_directory() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("the crate lives under crates/")
}

/// The dependency names declared under `[dependencies]`, stopping at the next
/// section header. Enough for manifests in this workspace, which spell every
/// dependency as one `name = …` line.
fn declared_dependencies(manifest: &str) -> Vec<String> {
    manifest
        .lines()
        .map(str::trim)
        .skip_while(|line| *line != "[dependencies]")
        .skip(1)
        .take_while(|line| !line.starts_with('['))
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .filter_map(|line| line.split_once('='))
        .map(|(name, _)| {
            name.trim()
                .trim_end_matches(".workspace")
                .trim_matches('"')
                .to_owned()
        })
        .collect()
}

#[test]
fn the_facade_depends_only_on_the_permitted_crates() {
    let manifest = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"))
        .expect("read the facade manifest");

    for dependency in declared_dependencies(&manifest) {
        assert!(
            ALLOWED_WORKSPACE_CRATES.contains(&dependency.as_str())
                || ALLOWED_EXTERNAL_CRATES.contains(&dependency.as_str()),
            "{dependency} is not permitted by ADR-0048 R-A3"
        );
    }
}

#[test]
fn no_permitted_crate_reaches_git_tauri_or_ollama() {
    for crate_name in ALLOWED_WORKSPACE_CRATES {
        let path = crates_directory().join(crate_name).join("Cargo.toml");
        let manifest = fs::read_to_string(&path).unwrap_or_else(|_| panic!("read {path:?}"));
        for dependency in declared_dependencies(&manifest) {
            assert!(
                !FORBIDDEN_CRATES.contains(&dependency.as_str()),
                "{crate_name} now depends on {dependency}, which cannot ship in the mobile core"
            );
        }
    }
}

#[test]
fn skriuw_domain_gained_no_dependency_from_the_mobile_work() {
    let manifest = fs::read_to_string(crates_directory().join("skriuw-domain/Cargo.toml"))
        .expect("read the domain manifest");

    assert_eq!(
        declared_dependencies(&manifest),
        [
            "ai-core",
            "schemars",
            "serde",
            "serde_json",
            "sha2",
            "thiserror"
        ]
    );
}
