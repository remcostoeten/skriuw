//! Note version capture/dedupe rules. Mirrors
//! `apps/web/src/domain/notes/versioning.ts` so a desktop checkpoint behaves the
//! same as a web one — same throttle window, same significant-change deltas,
//! same retention cap. The content hash here only needs to be internally
//! consistent (it dedupes within this SQLite table), not byte-identical to the
//! web hash, since desktop versions are local-only and never synced.

use sha2::{Digest, Sha256};

use crate::storage::NoteVersionSnapshot;

pub const MIN_INTERVAL_MS: i64 = 5 * 60 * 1000;
pub const SIGNIFICANT_CHAR_DELTA: i64 = 160;
pub const SIGNIFICANT_WORD_DELTA: i64 = 24;
/// Hard cap on stored versions per note; older rows are pruned on insert so the
/// note_versions table (full content snapshots) cannot grow unbounded.
pub const RETENTION_LIMIT: i64 = 50;

/// The lean fields needed to decide whether a new snapshot is worth persisting,
/// without loading the latest version's full `richContent`/properties JSON.
pub struct LatestVersionLean {
    pub content_hash: String,
    pub created_at: i64,
    pub content: String,
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

fn count_words(content: &str) -> i64 {
    content.split_whitespace().count() as i64
}

fn count_chars(content: &str) -> i64 {
    content.chars().count() as i64
}

/// True when `snapshot` should be written as a new version row, given the most
/// recently stored one (`latest`, or `None` for a note with no history yet).
pub fn should_persist(
    snapshot: &NoteVersionSnapshot,
    reason: &str,
    created_at: i64,
    latest: Option<&LatestVersionLean>,
) -> bool {
    let Some(latest) = latest else {
        return true;
    };

    let next_hash = content_hash(snapshot);
    if next_hash == latest.content_hash {
        return false;
    }

    if reason != "autosave" {
        return true;
    }

    let elapsed = created_at - latest.created_at;
    if elapsed >= MIN_INTERVAL_MS {
        return true;
    }

    let char_delta = (count_chars(&snapshot.content) - count_chars(&latest.content)).abs();
    if char_delta >= SIGNIFICANT_CHAR_DELTA {
        return true;
    }

    let word_delta = (count_words(&snapshot.content) - count_words(&latest.content)).abs();
    word_delta >= SIGNIFICANT_WORD_DELTA
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

    #[test]
    fn no_latest_always_persists() {
        assert!(should_persist(&snapshot("hello"), "autosave", 0, None));
    }

    #[test]
    fn identical_hash_never_persists_regardless_of_reason() {
        let snap = snapshot("hello");
        let latest = LatestVersionLean {
            content_hash: content_hash(&snap),
            created_at: 0,
            content: "hello".to_string(),
        };
        assert!(!should_persist(&snap, "rename", 1, Some(&latest)));
        assert!(!should_persist(&snap, "checkpoint", 1, Some(&latest)));
    }

    #[test]
    fn non_autosave_reason_always_persists_on_change() {
        let latest = LatestVersionLean {
            content_hash: content_hash(&snapshot("hello")),
            created_at: 0,
            content: "hello".to_string(),
        };
        assert!(should_persist(&snapshot("hello world"), "rename", 1, Some(&latest)));
    }

    #[test]
    fn autosave_throttles_small_quick_edits() {
        let latest = LatestVersionLean {
            content_hash: content_hash(&snapshot("hello")),
            created_at: 0,
            content: "hello".to_string(),
        };
        assert!(!should_persist(
            &snapshot("hello!"),
            "autosave",
            1_000,
            Some(&latest)
        ));
    }

    #[test]
    fn autosave_persists_after_min_interval() {
        let latest = LatestVersionLean {
            content_hash: content_hash(&snapshot("hello")),
            created_at: 0,
            content: "hello".to_string(),
        };
        assert!(should_persist(
            &snapshot("hello!"),
            "autosave",
            MIN_INTERVAL_MS,
            Some(&latest)
        ));
    }

    #[test]
    fn autosave_persists_on_significant_char_delta() {
        let latest = LatestVersionLean {
            content_hash: content_hash(&snapshot("hello")),
            created_at: 0,
            content: "hello".to_string(),
        };
        let big = "x".repeat(200);
        assert!(should_persist(&snapshot(&big), "autosave", 1_000, Some(&latest)));
    }
}
