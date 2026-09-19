//! Machine-local routing from a cloud workspace identity to the directory that
//! holds that account's local store.
//!
//! One installation may be used by more than one account. Without this the
//! first account to sign in brands the single local store forever, and every
//! later account dead-ends on the sync guard with no way forward but a manual
//! reset. The registry keeps one directory per cloud workspace so switching
//! accounts is a routing change rather than a conflict the user has to resolve.
//!
//! Only the file recorded here is authoritative for *which directory* is
//! active. What lives inside a directory remains owned by the workspace
//! database; this file never duplicates workspace content.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

const REGISTRY_FILE: &str = "workspaces.json";
const SLOT_PARENT: &str = "workspaces";

/// Outcome of pointing the installation at an account's workspace.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SlotAdoption {
    /// The unclaimed local workspace now belongs to this account. Its contents
    /// are untouched and become that account's first synced content.
    Claimed,
    /// This account already owns the running workspace; nothing changed.
    Active,
    /// Another account owns the running workspace. The registry now points at
    /// this account's own directory and the process must restart to open it.
    Switched,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Registry {
    /// Cloud workspace id whose directory is currently open, or `None` while
    /// the installation has never been signed in.
    #[serde(default)]
    active: Option<String>,
    /// Cloud workspace id to directory, relative to the storage base. The empty
    /// string is the base itself, which is where a pre-registry installation
    /// already keeps its database.
    #[serde(default)]
    slots: BTreeMap<String, String>,
}

/// Cloud workspace ids are `w_` plus a SHA-256 digest in lowercase hex. They
/// arrive from the renderer and are used to build a path, so nothing outside
/// this shape is accepted.
pub(crate) fn is_workspace_id(value: &str) -> bool {
    value.len() == 66
        && value.starts_with("w_")
        && value[2..].bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

/// A directory read back from the registry file. Rejecting anything the code
/// below would not have written keeps an edited or corrupted file from
/// escaping the storage base.
fn is_known_directory(value: &str) -> bool {
    if value.is_empty() {
        return true;
    }
    value
        .strip_prefix(SLOT_PARENT)
        .and_then(|rest| rest.strip_prefix('/'))
        .is_some_and(is_workspace_id)
}

fn registry_file(data_dir: &Path) -> PathBuf {
    data_dir.join(REGISTRY_FILE)
}

/// Reads the registry, falling back to an empty one. A missing file is the
/// normal first-run state; an unreadable file must not keep the workspace from
/// opening, so it degrades to the pre-registry layout instead of failing.
fn read(data_dir: &Path) -> Registry {
    let Ok(raw) = fs::read_to_string(registry_file(data_dir)) else {
        return Registry::default();
    };
    let Ok(registry) = serde_json::from_str::<Registry>(&raw) else {
        eprintln!("the workspace registry was unreadable; opening the default workspace");
        return Registry::default();
    };
    if registry
        .slots
        .iter()
        .any(|(id, directory)| !is_workspace_id(id) || !is_known_directory(directory))
    {
        eprintln!("the workspace registry held an unusable entry; opening the default workspace");
        return Registry::default();
    }
    if registry
        .active
        .as_ref()
        .is_some_and(|id| !registry.slots.contains_key(id))
    {
        eprintln!("the workspace registry named an unknown workspace; opening the default workspace");
        return Registry::default();
    }
    registry
}

/// Replaces the registry atomically, so an interrupted write can never leave
/// the installation pointing at half a file.
fn write(data_dir: &Path, registry: &Registry) -> Result<(), String> {
    let serialized =
        serde_json::to_string_pretty(registry).map_err(|error| error.to_string())?;
    let target = registry_file(data_dir);
    let temporary = target.with_extension("json.tmp");
    fs::write(&temporary, serialized).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &target).map_err(|error| error.to_string())
}

fn resolve(base: &Path, directory: &str) -> PathBuf {
    if directory.is_empty() {
        base.to_path_buf()
    } else {
        base.join(directory)
    }
}

fn slot_directory(workspace_id: &str) -> String {
    format!("{SLOT_PARENT}/{workspace_id}")
}

/// Directory holding the workspace this installation should open. Called on
/// every start, before anything touches the database.
pub(crate) fn active_directory(data_dir: &Path, base: &Path) -> PathBuf {
    let registry = read(data_dir);
    registry
        .active
        .as_ref()
        .and_then(|id| registry.slots.get(id))
        .map_or_else(|| base.to_path_buf(), |directory| resolve(base, directory))
}

/// Cloud workspace that owns the running local store, or `None` while it is
/// still unclaimed.
pub(crate) fn active_workspace_id(data_dir: &Path) -> Option<String> {
    read(data_dir).active
}

/// Points the installation at `workspace_id`.
///
/// An unclaimed workspace is claimed in place, which is what makes a first
/// sign-in keep the notes the user already wrote. An account that does not own
/// the running workspace gets its own directory, created empty so sync
/// rehydrates it; the previous account's directory is left untouched and is
/// reached again by signing back in.
///
/// `linked` is the workspace the running store has already synced with, which
/// the store itself records. An installation predating this registry has no
/// entry but may very much have an owner, and claiming it for whoever signs in
/// next would hand one account's notes to another.
pub(crate) fn adopt(
    data_dir: &Path,
    base: &Path,
    workspace_id: &str,
    linked: Option<&str>,
) -> Result<SlotAdoption, String> {
    if !is_workspace_id(workspace_id) {
        return Err("the cloud returned an unusable workspace identity".into());
    }
    let mut registry = read(data_dir);
    if registry.active.is_none()
        && let Some(owner) = linked.filter(|owner| is_workspace_id(owner))
    {
        registry.slots.insert(owner.to_string(), String::new());
        registry.active = Some(owner.to_string());
    }
    match registry.active.as_deref() {
        Some(active) if active == workspace_id => {
            // Recording an owner the store already knew is not a change the
            // caller has to act on, but it must still be persisted.
            write(data_dir, &registry)?;
            Ok(SlotAdoption::Active)
        }
        Some(_) => {
            let directory = registry
                .slots
                .entry(workspace_id.to_string())
                .or_insert_with(|| slot_directory(workspace_id))
                .clone();
            fs::create_dir_all(resolve(base, &directory)).map_err(|error| error.to_string())?;
            registry.active = Some(workspace_id.to_string());
            write(data_dir, &registry)?;
            Ok(SlotAdoption::Switched)
        }
        None => {
            registry.slots.insert(workspace_id.to_string(), String::new());
            registry.active = Some(workspace_id.to_string());
            write(data_dir, &registry)?;
            Ok(SlotAdoption::Claimed)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn accepts_only_prefixed_lowercase_digest_identities() {
        let valid = format!("w_{}", "a1".repeat(32));
        assert!(is_workspace_id(&valid));
        assert!(!is_workspace_id(&format!("w_{}", "A1".repeat(32))));
        assert!(!is_workspace_id("w_abc"));
        assert!(!is_workspace_id(&format!("x_{}", "a1".repeat(32))));
        assert!(!is_workspace_id("w_../../etc/passwd"));
    }

    #[test]
    fn opens_the_base_directory_before_any_account_has_signed_in() {
        let dir = tempdir().expect("tempdir");
        assert_eq!(active_directory(dir.path(), dir.path()), dir.path());
        assert_eq!(active_workspace_id(dir.path()), None);
    }

    #[test]
    fn first_account_claims_the_existing_workspace_in_place() {
        let dir = tempdir().expect("tempdir");
        let id = format!("w_{}", "a1".repeat(32));
        assert_eq!(
            adopt(dir.path(), dir.path(), &id, None).expect("adopt"),
            SlotAdoption::Claimed,
        );
        assert_eq!(active_directory(dir.path(), dir.path()), dir.path());
        assert_eq!(active_workspace_id(dir.path()).as_deref(), Some(id.as_str()));
        assert_eq!(
            adopt(dir.path(), dir.path(), &id, None).expect("re-adopt"),
            SlotAdoption::Active,
        );
    }

    #[test]
    fn second_account_switches_to_its_own_directory_and_back() {
        let dir = tempdir().expect("tempdir");
        let first = format!("w_{}", "a1".repeat(32));
        let second = format!("w_{}", "b2".repeat(32));
        adopt(dir.path(), dir.path(), &first, None).expect("claim");
        assert_eq!(
            adopt(dir.path(), dir.path(), &second, None).expect("switch"),
            SlotAdoption::Switched,
        );
        let switched = active_directory(dir.path(), dir.path());
        assert_eq!(switched, dir.path().join(SLOT_PARENT).join(&second));
        assert!(switched.is_dir());
        assert_eq!(
            adopt(dir.path(), dir.path(), &first, None).expect("switch back"),
            SlotAdoption::Switched,
        );
        assert_eq!(active_directory(dir.path(), dir.path()), dir.path());
    }

    #[test]
    fn a_store_linked_before_the_registry_existed_keeps_its_own_account() {
        let dir = tempdir().expect("tempdir");
        let owner = format!("w_{}", "a1".repeat(32));
        let newcomer = format!("w_{}", "b2".repeat(32));

        // The account that had already linked this store signs in: it owns the
        // base directory even though no registry entry recorded it yet.
        assert_eq!(
            adopt(dir.path(), dir.path(), &owner, Some(&owner)).expect("owner"),
            SlotAdoption::Active,
        );
        assert_eq!(active_directory(dir.path(), dir.path()), dir.path());

        // And the other account is routed away from it rather than claiming it.
        assert_eq!(
            adopt(dir.path(), dir.path(), &newcomer, Some(&owner)).expect("newcomer"),
            SlotAdoption::Switched,
        );
        assert_eq!(
            active_directory(dir.path(), dir.path()),
            dir.path().join(SLOT_PARENT).join(&newcomer),
        );
    }

    #[test]
    fn a_never_linked_store_is_still_claimed_in_place() {
        let dir = tempdir().expect("tempdir");
        let id = format!("w_{}", "b2".repeat(32));
        assert_eq!(
            adopt(dir.path(), dir.path(), &id, None).expect("claim"),
            SlotAdoption::Claimed,
        );
        assert_eq!(active_directory(dir.path(), dir.path()), dir.path());
    }

    #[test]
    fn rejects_an_identity_that_could_escape_the_storage_base() {
        let dir = tempdir().expect("tempdir");
        adopt(dir.path(), dir.path(), "../../elsewhere", None).expect_err("must refuse");
        assert_eq!(active_workspace_id(dir.path()), None);
    }

    #[test]
    fn a_corrupt_or_escaping_registry_falls_back_to_the_default_workspace() {
        let dir = tempdir().expect("tempdir");
        fs::write(registry_file(dir.path()), "{ not json").expect("write");
        assert_eq!(active_directory(dir.path(), dir.path()), dir.path());
        fs::write(
            registry_file(dir.path()),
            r#"{"active":"w_x","slots":{"w_x":"../escape"}}"#,
        )
        .expect("write");
        assert_eq!(active_directory(dir.path(), dir.path()), dir.path());
        assert_eq!(active_workspace_id(dir.path()), None);
    }
}
