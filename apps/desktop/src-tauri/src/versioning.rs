//! Note version capture/dedupe rules. Mirrors
//! `apps/web/src/domain/notes/versioning.ts` so a desktop checkpoint behaves the
//! same as a web one — same trivial-edit filter, same coalesce window, same
//! retention cap. The content hash here only needs to be internally
//! consistent (it dedupes within this SQLite table), not byte-identical to the
//! web hash, since desktop versions are local-only and never synced.

use sha2::{Digest, Sha256};

use crate::storage::NoteVersionSnapshot;

/// Autosaves/checkpoints landing within this window of the latest stored
/// autosave/checkpoint row overwrite it in place instead of inserting, so a
/// typing burst yields one version instead of one per save.
pub const COALESCE_WINDOW_MS: i64 = 60 * 1000;
/// Edits whose changed region is at most this many characters are noise
/// (a typo fix, one or two letters) and never worth a version on their own.
pub const TRIVIAL_CHAR_DELTA: usize = 2;
/// Hard cap on stored versions per note; older rows are pruned on insert so the
/// note_versions table (full content snapshots) cannot grow unbounded.
pub const RETENTION_LIMIT: i64 = 200;

/// The lean fields needed to decide whether a new snapshot is worth persisting,
/// without loading the latest version's full `richContent`/properties JSON.
pub struct LatestVersionLean {
    pub id: String,
    pub content_hash: String,
    pub created_at: i64,
    pub content: String,
    pub reason: String,
}

/// What to do with an incoming snapshot relative to the latest stored version.
#[derive(Debug, PartialEq, Eq)]
pub enum VersionDecision {
    Skip,
    Insert,
    /// Overwrite the latest row (by id) in place.
    Coalesce(String),
}

fn normalize_tags(tags: &[String]) -> Vec<String> {
    let mut normalized: Vec<String> = tags
        .iter()
        .map(|tag| tag.trim().to_lowercase())
        .filter(|tag| !tag.is_empty())
        .collect();
    normalized.sort();
    normalized.dedup();
    normalized
}

pub fn content_hash(snapshot: &NoteVersionSnapshot) -> String {
    let payload = serde_json::json!({
        "name": snapshot.name,
        "content": snapshot.content,
        "richContent": snapshot.rich_content,
        "preferredEditorMode": snapshot.preferred_editor_mode,
        "parentId": snapshot.parent_id,
        "tags": normalize_tags(&snapshot.tags),
        "properties": snapshot.properties,
    });
    let serialized = serde_json::to_string(&payload).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(serialized.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// The differing middle of two strings after stripping their common prefix and
/// suffix — a cheap stand-in for edit distance that correctly sees same-length
/// replacements (where a raw length delta reads as zero change).
fn changed_regions(prev: &str, next: &str) -> (Vec<char>, Vec<char>) {
    let prev: Vec<char> = prev.chars().collect();
    let next: Vec<char> = next.chars().collect();
    let mut start = 0;
    while start < prev.len() && start < next.len() && prev[start] == next[start] {
        start += 1;
    }
    let mut prev_end = prev.len();
    let mut next_end = next.len();
    while prev_end > start && next_end > start && prev[prev_end - 1] == next[next_end - 1] {
        prev_end -= 1;
        next_end -= 1;
    }
    (
        prev[start..prev_end].to_vec(),
        next[start..next_end].to_vec(),
    )
}

fn is_trivial_content_edit(prev: &str, next: &str) -> bool {
    if prev == next {
        return false;
    }
    let strip = |s: &str| s.chars().filter(|c| !c.is_whitespace()).collect::<String>();
    if strip(prev) == strip(next) {
        return true;
    }
    let (prev_region, next_region) = changed_regions(prev, next);
    prev_region.len().max(next_region.len()) <= TRIVIAL_CHAR_DELTA
}

fn coalesces_with(reason: &str) -> bool {
    matches!(reason, "autosave" | "checkpoint")
}

/// Decides how to persist `snapshot` given the most recently stored version
/// (`latest`, or `None` for a note with no history yet):
/// - identical content hash → skip
/// - explicit reasons (created/rename/restore) → always insert on change
/// - whitespace-only or ≤`TRIVIAL_CHAR_DELTA`-char edits → skip
/// - within `COALESCE_WINDOW_MS` of the latest autosave/checkpoint row →
///   overwrite that row instead of inserting
/// - otherwise → insert
pub fn decide(
    snapshot: &NoteVersionSnapshot,
    reason: &str,
    created_at: i64,
    latest: Option<&LatestVersionLean>,
) -> VersionDecision {
    let Some(latest) = latest else {
        return VersionDecision::Insert;
    };

    if content_hash(snapshot) == latest.content_hash {
        return VersionDecision::Skip;
    }

    if !coalesces_with(reason) {
        return VersionDecision::Insert;
    }

    if is_trivial_content_edit(&latest.content, &snapshot.content) {
        return VersionDecision::Skip;
    }

    let elapsed = created_at - latest.created_at;
    if coalesces_with(&latest.reason) && elapsed < COALESCE_WINDOW_MS {
        return VersionDecision::Coalesce(latest.id.clone());
    }

    VersionDecision::Insert
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(content: &str) -> NoteVersionSnapshot {
        NoteVersionSnapshot {
            name: "Note.md".to_string(),
            content: content.to_string(),
            rich_content: serde_json::json!([]),
            preferred_editor_mode: "block".to_string(),
            parent_id: None,
            tags: vec![],
            properties: serde_json::json!([]),
        }
    }

    fn latest(content: &str, reason: &str, created_at: i64) -> LatestVersionLean {
        LatestVersionLean {
            id: "v1".to_string(),
            content_hash: content_hash(&snapshot(content)),
            created_at,
            content: content.to_string(),
            reason: reason.to_string(),
        }
    }

    #[test]
    fn no_latest_always_inserts() {
        assert_eq!(
            decide(&snapshot("hello"), "autosave", 0, None),
            VersionDecision::Insert
        );
    }

    #[test]
    fn identical_hash_never_persists_regardless_of_reason() {
        let l = latest("hello", "autosave", 0);
        assert_eq!(
            decide(&snapshot("hello"), "rename", 1, Some(&l)),
            VersionDecision::Skip
        );
        assert_eq!(
            decide(&snapshot("hello"), "checkpoint", 1, Some(&l)),
            VersionDecision::Skip
        );
    }

    #[test]
    fn non_autosave_reason_always_inserts_on_change() {
        let l = latest("hello", "autosave", 0);
        assert_eq!(
            decide(&snapshot("hello world"), "rename", 1, Some(&l)),
            VersionDecision::Insert
        );
    }

    #[test]
    fn whitespace_only_edit_is_skipped() {
        let l = latest("hello world", "autosave", 0);
        assert_eq!(
            decide(
                &snapshot("hello  world\n"),
                "autosave",
                COALESCE_WINDOW_MS * 10,
                Some(&l)
            ),
            VersionDecision::Skip
        );
    }

    #[test]
    fn one_or_two_char_edit_is_skipped() {
        let l = latest("hello", "autosave", 0);
        assert_eq!(
            decide(
                &snapshot("hello!"),
                "autosave",
                COALESCE_WINDOW_MS * 10,
                Some(&l)
            ),
            VersionDecision::Skip
        );
        assert_eq!(
            decide(
                &snapshot("heLLo"),
                "autosave",
                COALESCE_WINDOW_MS * 10,
                Some(&l)
            ),
            VersionDecision::Skip
        );
    }

    #[test]
    fn same_length_replacement_is_seen_as_change() {
        let l = latest("the cat sat", "autosave", 0);
        assert_eq!(
            decide(
                &snapshot("the dog ran"),
                "autosave",
                COALESCE_WINDOW_MS,
                Some(&l)
            ),
            VersionDecision::Insert
        );
    }

    #[test]
    fn meaningful_edit_within_window_coalesces() {
        let l = latest("hello", "autosave", 0);
        assert_eq!(
            decide(
                &snapshot("hello brave new world"),
                "autosave",
                1_000,
                Some(&l)
            ),
            VersionDecision::Coalesce("v1".to_string())
        );
    }

    #[test]
    fn meaningful_edit_after_window_inserts() {
        let l = latest("hello", "autosave", 0);
        assert_eq!(
            decide(
                &snapshot("hello brave new world"),
                "autosave",
                COALESCE_WINDOW_MS,
                Some(&l)
            ),
            VersionDecision::Insert
        );
    }

    #[test]
    fn never_coalesces_into_explicit_versions() {
        let l = latest("hello", "restore", 0);
        assert_eq!(
            decide(
                &snapshot("hello brave new world"),
                "autosave",
                1_000,
                Some(&l)
            ),
            VersionDecision::Insert
        );
    }
}
