//! R-A3 is a boundary, not a convention: the mobile facade may reach domain,
//! runtime, storage, sqlite, sync and crypto and nothing else, and nothing it
//! links may drag in libgit2, Tauri, Ollama or an HTTP client.
//!
//! The check walks `Cargo.lock`, not the manifests, because the manifests do
//! not show the whole graph: `skriuw-domain` takes `ai-core` from a git tag,
//! dependencies can be spelled as `[dependencies.name]` tables, and targets
//! can add their own. The lockfile is the resolved truth and it is committed.

use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    fs,
    path::{Path, PathBuf},
};

const FACADE: &str = "skriuw-mobile";

const ALLOWED_WORKSPACE_CRATES: [&str; 6] = [
    "skriuw-crypto",
    "skriuw-domain",
    "skriuw-runtime",
    "skriuw-sqlite",
    "skriuw-storage",
    "skriuw-sync",
];

/// Named individually rather than by prefix so that adding one is a deliberate
/// edit here, with the reason in the commit that adds it.
const FORBIDDEN_CRATES: [&str; 8] = [
    "git2",
    "libgit2-sys",
    "reqwest",
    "skriuw-ai-ollama",
    "skriuw-ai-remote",
    "skriuw-history-git",
    "tauri",
    "tauri-build",
];

fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("the crate lives at crates/<name> inside the repository")
        .to_path_buf()
}

/// `name -> dependency names` for every package in the lockfile. Cargo records
/// normal, build and dev dependencies in one list, so the graph this walks is a
/// superset of what the facade links — which is the safe direction for a rule
/// about what must never be reachable.
fn lockfile_graph(lockfile: &str) -> BTreeMap<String, Vec<String>> {
    let mut graph = BTreeMap::new();
    let mut name = None;
    let mut dependencies = Vec::new();
    let mut in_dependencies = false;

    for line in lockfile.lines().map(str::trim) {
        if line == "[[package]]" {
            if let Some(name) = name.take() {
                graph.insert(name, std::mem::take(&mut dependencies));
            }
            in_dependencies = false;
        } else if let Some(value) = line.strip_prefix("name = ") {
            name = Some(value.trim_matches('"').to_owned());
        } else if line.starts_with("dependencies = [") {
            in_dependencies = true;
        } else if in_dependencies {
            if line == "]" {
                in_dependencies = false;
            } else {
                // Entries are `"name"` or `"name version"` or
                // `"name version (source)"`; only the name matters here.
                let entry = line.trim_end_matches(',').trim_matches('"');
                if let Some(entry) = entry.split_whitespace().next() {
                    dependencies.push(entry.to_owned());
                }
            }
        }
    }
    if let Some(name) = name {
        graph.insert(name, dependencies);
    }
    graph
}

fn reachable_from_the_facade() -> BTreeSet<String> {
    let lockfile = fs::read_to_string(repository_root().join("Cargo.lock"))
        .expect("the workspace lockfile is committed");
    let graph = lockfile_graph(&lockfile);
    assert!(
        graph.contains_key(FACADE),
        "the facade is missing from the lockfile; run cargo check"
    );

    let mut reached = BTreeSet::new();
    let mut queue = VecDeque::from([FACADE.to_owned()]);
    while let Some(package) = queue.pop_front() {
        for dependency in graph.get(&package).into_iter().flatten() {
            if reached.insert(dependency.clone()) {
                queue.push_back(dependency.clone());
            }
        }
    }
    reached
}

#[test]
fn the_facade_reaches_no_other_workspace_crate() {
    let reached = reachable_from_the_facade();
    let unexpected: Vec<_> = reached
        .iter()
        .filter(|package| package.starts_with("skriuw-"))
        .filter(|package| !ALLOWED_WORKSPACE_CRATES.contains(&package.as_str()))
        .collect();

    assert!(
        unexpected.is_empty(),
        "ADR-0048 R-A3 permits domain, runtime, storage, sqlite, sync and crypto only; found {unexpected:?}"
    );
}

#[test]
fn the_facade_reaches_no_git_tauri_ollama_or_http_stack() {
    let reached = reachable_from_the_facade();
    let forbidden: Vec<_> = FORBIDDEN_CRATES
        .iter()
        .filter(|package| reached.contains(**package))
        .collect();

    assert!(
        forbidden.is_empty(),
        "these cannot ship inside the mobile core: {forbidden:?}"
    );
}

#[test]
fn skriuw_domain_gained_no_dependency_from_the_mobile_work() {
    let manifest = fs::read_to_string(repository_root().join("crates/skriuw-domain/Cargo.toml"))
        .expect("read the domain manifest");
    let declared: Vec<_> = manifest
        .lines()
        .map(str::trim)
        .skip_while(|line| *line != "[dependencies]")
        .skip(1)
        .take_while(|line| !line.starts_with('['))
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .filter_map(|line| line.split_once('='))
        .map(|(name, _)| name.trim().trim_end_matches(".workspace").to_owned())
        .collect();

    assert_eq!(
        declared,
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

/// Keeps the two rules above from passing because the walk returned nothing.
/// `git2` is in this lockfile — `skriuw-history-git` links it — so the walk has
/// to reach the crates the facade really uses and stop short of that one.
#[test]
fn the_lockfile_walk_is_neither_empty_nor_exhaustive() {
    let lockfile = fs::read_to_string(repository_root().join("Cargo.lock"))
        .expect("the workspace lockfile is committed");
    let graph = lockfile_graph(&lockfile);
    assert!(graph.contains_key("git2"), "git2 left the workspace");

    let reached = reachable_from_the_facade();
    for expected in ["skriuw-domain", "rusqlite", "libsqlite3-sys", "uniffi"] {
        assert!(
            reached.contains(expected),
            "{expected} is missing from the walked graph, so the parser is not reading the lockfile"
        );
    }
    assert!(
        !reached.contains("git2"),
        "the walk reaches every package, so it proves nothing"
    );
}
