//! Routing from a cloud workspace identity to the directory that holds that
//! account's local store (ADR-0046).
//!
//! One phone is used by more than one account. Without this the first account
//! to sign in brands the single local store forever, and every later account
//! dead-ends on the sync guard with no way forward but clearing app storage.
//! The registry keeps one directory per cloud workspace, so switching accounts
//! is a routing change rather than a conflict the user has to resolve.
//!
//! The file is authoritative for *which directory* is active and nothing else;
//! what lives inside a directory stays owned by the workspace database. The
//! layout is the desktop one (`workspaces.json`, `workspaces/<id>/`) so a
//! directory copied between the two clients still resolves.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::{boundary::guarded, error::MobileError};

const REGISTRY_FILE: &str = "workspaces.json";
const SLOT_PARENT: &str = "workspaces";

/// Outcome of pointing the installation at an account's workspace. Mirrors
/// `SlotAdoption` in `app/src-tauri/src/workspace_slots.rs` and the
/// `SlotAdoption` union the renderer bridge already speaks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, uniffi::Enum)]
#[serde(rename_all = "camelCase")]
pub enum SlotAdoption {
    /// The unclaimed local workspace now belongs to this account. Its contents
    /// are untouched and become that account's first synced content.
    Claimed,
    /// This account already owns the open workspace; nothing changed.
    Active,
    /// Another account owns the open workspace. The registry now points at
    /// this account's own directory and the shell must reopen on it.
    Switched,
}

/// Where the shell must open the workspace after routing an account.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct WorkspaceRoute {
    pub adoption: SlotAdoption,
    /// Absolute directory to open. Always the account's own storage.
    pub directory: String,
    /// True when `directory` is not the one currently open, so the shell has
    /// to close its handle and reopen before anything reads the store again.
    pub reopen_required: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Registry {
    /// Cloud workspace id whose directory is currently open, or `None` while
    /// this installation has never been signed in.
    #[serde(default)]
    active: Option<String>,
    /// Cloud workspace id to directory, relative to the storage base. The
    /// empty string is the base itself, which is where an installation that
    /// predates the registry already keeps its database.
    #[serde(default)]
    slots: BTreeMap<String, String>,
}

/// Cloud workspace ids are `w_` plus a SHA-256 digest in lowercase hex. They
/// arrive from the shell and are used to build a path, so nothing outside this
/// shape is accepted.
#[must_use]
pub(crate) fn is_workspace_id(value: &str) -> bool {
    value.len() == 66
        && value.starts_with("w_")
        && value[2..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

/// A directory read back from the registry. Refusing anything this module
/// would not have written keeps an edited or corrupted file from escaping the
/// storage base.
fn is_known_directory(value: &str) -> bool {
    if value.is_empty() {
        return true;
    }
    value
        .strip_prefix(SLOT_PARENT)
        .and_then(|rest| rest.strip_prefix('/'))
        .is_some_and(is_workspace_id)
}

fn registry_file(base: &Path) -> PathBuf {
    base.join(REGISTRY_FILE)
}

/// Reads the registry, falling back to an empty one. A missing file is the
/// normal first-run state; an unreadable one must never keep the workspace
/// from opening, so it degrades to the pre-registry layout instead of failing.
fn read(base: &Path) -> Registry {
    let Ok(raw) = fs::read_to_string(registry_file(base)) else {
        return Registry::default();
    };
    let Ok(registry) = serde_json::from_str::<Registry>(&raw) else {
        return Registry::default();
    };
    if registry
        .slots
        .iter()
        .any(|(id, directory)| !is_workspace_id(id) || !is_known_directory(directory))
    {
        return Registry::default();
    }
    if registry
        .active
        .as_ref()
        .is_some_and(|id| !registry.slots.contains_key(id))
    {
        return Registry::default();
    }
    registry
}

/// Replaces the registry atomically, so an interrupted write can never leave
/// the installation pointing at half a file.
fn write(base: &Path, registry: &Registry) -> Result<(), MobileError> {
    let serialized = serde_json::to_string_pretty(registry)
        .map_err(|error| MobileError::internal(error.to_string()))?;
    let target = registry_file(base);
    let temporary = target.with_extension("json.tmp");
    fs::write(&temporary, serialized)
        .map_err(|error| MobileError::workspace(format!("{REGISTRY_FILE}: {error}")))?;
    fs::rename(&temporary, &target)
        .map_err(|error| MobileError::workspace(format!("{REGISTRY_FILE}: {error}")))
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

fn storage_base(base_directory: &str) -> Result<PathBuf, MobileError> {
    if base_directory.trim().is_empty() {
        return Err(MobileError::workspace("storage base path is empty"));
    }
    let base = PathBuf::from(base_directory);
    fs::create_dir_all(&base)
        .map_err(|error| MobileError::workspace(format!("{base_directory}: {error}")))?;
    Ok(base)
}

fn active_directory(base: &Path) -> PathBuf {
    let registry = read(base);
    registry
        .active
        .as_ref()
        .and_then(|id| registry.slots.get(id))
        .map_or_else(|| base.to_path_buf(), |directory| resolve(base, directory))
}

/// Directory holding the workspace this installation should open. Called at
/// startup, before anything touches the database.
#[uniffi::export]
pub fn active_workspace_directory(base_directory: String) -> Result<String, MobileError> {
    guarded(|| {
        let base = storage_base(&base_directory)?;
        Ok(active_directory(&base).to_string_lossy().into_owned())
    })
}

/// Cloud workspace that owns the open local store, or `None` while it is still
/// unclaimed.
#[uniffi::export]
pub fn active_workspace_slot(base_directory: String) -> Result<Option<String>, MobileError> {
    guarded(|| Ok(read(&storage_base(&base_directory)?).active))
}

/// Points the installation at `workspace_id`.
///
/// An unclaimed workspace is claimed in place, which is what keeps a first
/// sign-in from losing the notes someone wrote before they had an account. An
/// account that does not own the open workspace gets its own directory,
/// created empty so sync rehydrates it; the previous account's directory is
/// left untouched on disk and is reached again by signing back into it.
///
/// `linked_workspace_id` is the workspace the open store has already synced
/// with, which the store itself records. An installation predating this
/// registry has no entry but may very much have an owner, and claiming it for
/// whoever signs in next would hand one account's notes to another.
#[uniffi::export]
pub fn adopt_workspace_slot(
    base_directory: String,
    workspace_id: String,
    linked_workspace_id: Option<String>,
) -> Result<WorkspaceRoute, MobileError> {
    guarded(|| {
        if !is_workspace_id(&workspace_id) {
            return Err(MobileError::workspace(
                "the cloud returned an unusable workspace identity",
            ));
        }
        let base = storage_base(&base_directory)?;
        let opened = active_directory(&base);
        let mut registry = read(&base);
        if registry.active.is_none()
            && let Some(owner) = linked_workspace_id
                .as_deref()
                .filter(|owner| is_workspace_id(owner))
        {
            registry.slots.insert(owner.to_string(), String::new());
            registry.active = Some(owner.to_string());
        }
        let adoption = match registry.active.as_deref() {
            Some(active) if active == workspace_id => SlotAdoption::Active,
            Some(_) => {
                let directory = registry
                    .slots
                    .entry(workspace_id.clone())
                    .or_insert_with(|| slot_directory(&workspace_id))
                    .clone();
                fs::create_dir_all(resolve(&base, &directory))
                    .map_err(|error| MobileError::workspace(format!("{directory}: {error}")))?;
                registry.active = Some(workspace_id.clone());
                SlotAdoption::Switched
            }
            None => {
                registry.slots.insert(workspace_id.clone(), String::new());
                registry.active = Some(workspace_id.clone());
                SlotAdoption::Claimed
            }
        };
        write(&base, &registry)?;
        let directory = active_directory(&base);
        Ok(WorkspaceRoute {
            adoption,
            reopen_required: directory != opened,
            directory: directory.to_string_lossy().into_owned(),
        })
    })
}

#[cfg(test)]
mod tests {
    use super::{
        REGISTRY_FILE, SLOT_PARENT, SlotAdoption, active_workspace_directory,
        active_workspace_slot, adopt_workspace_slot, is_workspace_id,
    };
    use std::{fs, path::Path};
    use tempfile::{TempDir, tempdir};

    fn identity(seed: &str) -> String {
        format!("w_{}", seed.repeat(32))
    }

    fn base(directory: &TempDir) -> String {
        directory.path().to_string_lossy().into_owned()
    }

    #[test]
    fn accepts_only_prefixed_lowercase_digest_identities() {
        assert!(is_workspace_id(&identity("a1")));
        assert!(!is_workspace_id(&format!("w_{}", "A1".repeat(32))));
        assert!(!is_workspace_id("w_abc"));
        assert!(!is_workspace_id(&format!("x_{}", "a1".repeat(32))));
        assert!(!is_workspace_id("w_../../etc/passwd"));
    }

    #[test]
    fn opens_the_base_directory_before_any_account_has_signed_in() {
        let directory = tempdir().expect("tempdir");
        assert_eq!(
            active_workspace_directory(base(&directory)).expect("directory"),
            base(&directory),
        );
        assert_eq!(active_workspace_slot(base(&directory)).expect("slot"), None);
    }

    #[test]
    fn the_first_account_claims_the_existing_workspace_in_place() {
        let directory = tempdir().expect("tempdir");
        let id = identity("a1");
        let route = adopt_workspace_slot(base(&directory), id.clone(), None).expect("claim");
        assert_eq!(route.adoption, SlotAdoption::Claimed);
        assert!(!route.reopen_required);
        assert_eq!(route.directory, base(&directory));
        assert_eq!(
            active_workspace_slot(base(&directory))
                .expect("slot")
                .as_deref(),
            Some(id.as_str()),
        );

        let again = adopt_workspace_slot(base(&directory), id, None).expect("re-adopt");
        assert_eq!(again.adoption, SlotAdoption::Active);
        assert!(!again.reopen_required);
    }

    #[test]
    fn a_second_account_never_reads_the_first_accounts_storage() {
        let directory = tempdir().expect("tempdir");
        let first = identity("a1");
        let second = identity("b2");
        adopt_workspace_slot(base(&directory), first.clone(), None).expect("claim");
        fs::write(directory.path().join("skriuw.db"), b"first account notes").expect("write");

        let route = adopt_workspace_slot(base(&directory), second.clone(), None).expect("switch");
        assert_eq!(route.adoption, SlotAdoption::Switched);
        assert!(route.reopen_required);
        let switched = Path::new(&route.directory);
        assert_eq!(switched, directory.path().join(SLOT_PARENT).join(&second));
        assert!(switched.is_dir());
        assert_eq!(
            fs::read_dir(switched).expect("read").count(),
            0,
            "a switched account starts on empty storage and rehydrates from the cloud",
        );

        // Reversible and lossless: the first account's database is untouched.
        let back = adopt_workspace_slot(base(&directory), first, None).expect("switch back");
        assert_eq!(back.adoption, SlotAdoption::Switched);
        assert!(back.reopen_required);
        assert_eq!(back.directory, base(&directory));
        assert_eq!(
            fs::read(directory.path().join("skriuw.db")).expect("read"),
            b"first account notes",
        );
    }

    #[test]
    fn a_store_linked_before_the_registry_existed_keeps_its_own_account() {
        let directory = tempdir().expect("tempdir");
        let owner = identity("a1");
        let newcomer = identity("b2");

        let resumed = adopt_workspace_slot(base(&directory), owner.clone(), Some(owner.clone()))
            .expect("owner");
        assert_eq!(resumed.adoption, SlotAdoption::Active);
        assert_eq!(resumed.directory, base(&directory));

        let routed = adopt_workspace_slot(base(&directory), newcomer.clone(), Some(owner))
            .expect("newcomer");
        assert_eq!(routed.adoption, SlotAdoption::Switched);
        assert_eq!(
            Path::new(&routed.directory),
            directory.path().join(SLOT_PARENT).join(&newcomer),
        );
    }

    #[test]
    fn refuses_an_identity_that_could_escape_the_storage_base() {
        let directory = tempdir().expect("tempdir");
        adopt_workspace_slot(base(&directory), "../../elsewhere".into(), None)
            .expect_err("must refuse");
        assert_eq!(active_workspace_slot(base(&directory)).expect("slot"), None);
    }

    #[test]
    fn a_corrupt_or_escaping_registry_falls_back_to_the_default_workspace() {
        let directory = tempdir().expect("tempdir");
        let registry = directory.path().join(REGISTRY_FILE);
        fs::write(&registry, "{ not json").expect("write");
        assert_eq!(
            active_workspace_directory(base(&directory)).expect("directory"),
            base(&directory),
        );
        fs::write(&registry, r#"{"active":"w_x","slots":{"w_x":"../escape"}}"#).expect("write");
        assert_eq!(
            active_workspace_directory(base(&directory)).expect("directory"),
            base(&directory),
        );
        assert_eq!(active_workspace_slot(base(&directory)).expect("slot"), None);
    }
}
