use serde_json::{Map, Value, json};

use crate::{OperationValidationError, WorkspaceOperation};

/// Settings extension holding every database view's layout, keyed by scope.
pub const DATABASE_VIEWS_EXTENSION: &str = "databaseViews";
/// Layout document version this build reads and writes.
pub const DATABASE_VIEWS_VERSION: u64 = 1;
/// Scope key of the all-notes database view.
pub const WORKSPACE_DATABASE_SCOPE: &str = "@workspace";
/// Most scopes the layout document keeps; the least recently changed go first.
pub const MAX_DATABASE_SCOPES: usize = 100;
/// Serialized size cap for one layout carried by `SetDatabaseView`.
pub const MAX_DATABASE_VIEW_BYTES: usize = 64 * 1024;
/// Size the merged document is evicted down to. It stays below
/// [`crate::MAX_DATABASE_VIEWS_BYTES`] so the stored document always validates.
pub const DATABASE_VIEWS_BUDGET_BYTES: usize = 240 * 1024;

/// Settings extensions that replicate through their own operations. A
/// device-local `UpdateSettings` keeps the stored value of each instead of
/// overwriting it.
pub const REPLICATED_SETTING_EXTENSIONS: [&str; 2] = ["mathMacros", DATABASE_VIEWS_EXTENSION];

#[must_use]
pub fn database_scope_key(folder_id: Option<&str>) -> &str {
    folder_id.unwrap_or(WORKSPACE_DATABASE_SCOPE)
}

pub fn validate_database_view(view: &Value) -> Result<(), OperationValidationError> {
    if !view.is_object() {
        return Err(OperationValidationError::InvalidDocument);
    }
    let size = serde_json::to_vec(view)
        .map_err(|_| OperationValidationError::InvalidDocument)?
        .len();
    if size > MAX_DATABASE_VIEW_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "database layout",
            maximum: MAX_DATABASE_VIEW_BYTES,
        });
    }
    Ok(())
}

/// The stored layout for one scope, if any.
#[must_use]
pub fn stored_database_view<'a>(
    stored: Option<&'a Value>,
    folder_id: Option<&str>,
) -> Option<&'a Value> {
    stored?
        .get("views")?
        .as_object()?
        .get(database_scope_key(folder_id))
}

/// Returns the layout document after one `SetDatabaseView`, or `None` when the
/// stored document belongs to a newer version and must be left alone.
///
/// Scopes naming a folder that `is_folder` rejects are dropped, the changed
/// scope is kept first, and the rest are kept newest `updatedAt` first, ties
/// by key, until [`MAX_DATABASE_SCOPES`] or [`DATABASE_VIEWS_BUDGET_BYTES`]
/// is reached. `packages/renderer-core/src/database/config.ts` applies the
/// same rule so the renderer and canonical storage agree.
#[must_use]
pub fn merge_database_view(
    stored: Option<&Value>,
    folder_id: Option<&str>,
    view: Option<&Value>,
    is_folder: impl Fn(&str) -> bool,
) -> Option<Value> {
    let empty = Map::new();
    let views = match stored {
        Some(document) => match (
            document.get("version").and_then(Value::as_u64),
            document.get("views").and_then(Value::as_object),
        ) {
            (Some(version), _) if version > DATABASE_VIEWS_VERSION => return None,
            (Some(_), Some(views)) => views,
            _ => &empty,
        },
        None => &empty,
    };
    let scope = database_scope_key(folder_id);
    let keeps_scope = |key: &str| key == WORKSPACE_DATABASE_SCOPE || is_folder(key);
    let current = view
        .filter(|_| keeps_scope(scope))
        .map(|view| (scope.to_owned(), view.clone()));
    let mut others: Vec<(&String, &Value)> = views
        .iter()
        .filter(|(key, entry)| key.as_str() != scope && entry.is_object() && keeps_scope(key))
        .collect();
    others.sort_by(|(left_key, left), (right_key, right)| {
        updated_at(right)
            .total_cmp(&updated_at(left))
            .then_with(|| left_key.cmp(right_key))
    });

    let mut total = serde_json::to_vec(&json!({ "version": DATABASE_VIEWS_VERSION, "views": {} }))
        .map_or(0, |bytes| bytes.len());
    let mut kept = Map::new();
    if let Some((key, view)) = current {
        total += entry_bytes(&key, &view);
        kept.insert(key, view);
    }
    for (key, entry) in others {
        if kept.len() >= MAX_DATABASE_SCOPES {
            break;
        }
        let size = entry_bytes(key, entry);
        if total + size > DATABASE_VIEWS_BUDGET_BYTES {
            break;
        }
        total += size;
        kept.insert(key.clone(), entry.clone());
    }
    Some(json!({ "version": DATABASE_VIEWS_VERSION, "views": kept }))
}

/// One `SetDatabaseView` per stored layout, for replaying layouts that were
/// saved before they replicated. A document from a newer version, or one this
/// build cannot read, yields nothing.
#[must_use]
pub fn database_view_operations(stored: Option<&Value>) -> Vec<WorkspaceOperation> {
    let Some(document) = stored else {
        return Vec::new();
    };
    let readable = document
        .get("version")
        .and_then(Value::as_u64)
        .is_some_and(|version| version <= DATABASE_VIEWS_VERSION);
    let Some(views) = document.get("views").and_then(Value::as_object) else {
        return Vec::new();
    };
    if !readable {
        return Vec::new();
    }
    let mut entries: Vec<(&String, &Value)> = views
        .iter()
        .filter(|(key, view)| validate_database_view(view).is_ok() && valid_scope(key))
        .collect();
    entries.sort_by(|(left_key, left), (right_key, right)| {
        updated_at(left)
            .total_cmp(&updated_at(right))
            .then_with(|| left_key.cmp(right_key))
    });
    entries
        .into_iter()
        .map(|(key, view)| WorkspaceOperation::SetDatabaseView {
            folder_id: (key != WORKSPACE_DATABASE_SCOPE).then(|| key.clone()),
            view: Some(view.clone()),
        })
        .collect()
}

fn valid_scope(key: &str) -> bool {
    key == WORKSPACE_DATABASE_SCOPE || crate::validate_id("folder id", key).is_ok()
}

fn updated_at(entry: &Value) -> f64 {
    entry
        .get("updatedAt")
        .and_then(Value::as_f64)
        .unwrap_or_default()
}

fn entry_bytes(key: &str, entry: &Value) -> usize {
    let key = serde_json::to_vec(key).map_or(0, |bytes| bytes.len());
    let entry = serde_json::to_vec(entry).map_or(0, |bytes| bytes.len());
    key + entry + 2
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn view(updated_at: i64) -> Value {
        json!({ "layout": "board", "updatedAt": updated_at })
    }

    fn keys(document: &Value) -> Vec<String> {
        let mut keys: Vec<String> = document["views"]
            .as_object()
            .expect("views")
            .keys()
            .cloned()
            .collect();
        keys.sort();
        keys
    }

    #[test]
    fn writes_and_clears_one_scope_without_touching_the_others() {
        let first =
            merge_database_view(None, Some("folder-a"), Some(&view(1)), |_| true).expect("merged");
        let second =
            merge_database_view(Some(&first), None, Some(&view(2)), |_| true).expect("merged");
        assert_eq!(keys(&second), ["@workspace", "folder-a"]);
        assert_eq!(
            stored_database_view(Some(&second), Some("folder-a")),
            Some(&view(1))
        );
        let cleared =
            merge_database_view(Some(&second), Some("folder-a"), None, |_| true).expect("merged");
        assert_eq!(keys(&cleared), ["@workspace"]);
    }

    #[test]
    fn drops_scopes_of_missing_folders_and_ignores_a_view_for_one() {
        let stored = json!({ "version": 1, "views": { "gone": view(5), "kept": view(4) } });
        let merged = merge_database_view(Some(&stored), Some("missing"), Some(&view(9)), |id| {
            id == "kept"
        })
        .expect("merged");
        assert_eq!(keys(&merged), ["kept"]);
    }

    #[test]
    fn evicts_the_least_recently_changed_scopes_past_the_count() {
        let mut document = None;
        for index in 0..=MAX_DATABASE_SCOPES {
            let folder = format!("folder-{index:03}");
            document = merge_database_view(
                document.as_ref(),
                Some(&folder),
                Some(&view(index as i64 + 1)),
                |_| true,
            );
        }
        let document = document.expect("merged");
        let kept = keys(&document);
        assert_eq!(kept.len(), MAX_DATABASE_SCOPES);
        assert!(!kept.contains(&"folder-000".to_string()));
        assert!(kept.contains(&format!("folder-{MAX_DATABASE_SCOPES:03}")));
    }

    #[test]
    fn evicts_down_to_the_byte_budget_and_always_keeps_the_changed_scope() {
        let mut document = None;
        let wide = |updated_at: i64| json!({ "order": ["x".repeat(MAX_DATABASE_VIEW_BYTES - 64)], "updatedAt": updated_at });
        for index in 0..6 {
            let folder = format!("folder-{index}");
            document =
                merge_database_view(document.as_ref(), Some(&folder), Some(&wide(index)), |_| {
                    true
                });
        }
        let document = document.expect("merged");
        let size = serde_json::to_vec(&document).expect("encode").len();
        assert!(size <= DATABASE_VIEWS_BUDGET_BYTES);
        assert!(keys(&document).contains(&"folder-5".to_string()));
        assert!(!keys(&document).contains(&"folder-0".to_string()));
    }

    #[test]
    fn leaves_a_newer_document_alone_and_restarts_an_unreadable_one() {
        let newer = json!({ "version": 2, "views": {} });
        assert_eq!(
            merge_database_view(Some(&newer), None, Some(&view(1)), |_| true),
            None
        );
        let broken = json!({ "views": [] });
        let merged =
            merge_database_view(Some(&broken), None, Some(&view(1)), |_| true).expect("merged");
        assert_eq!(keys(&merged), ["@workspace"]);
    }

    #[test]
    fn replays_stored_layouts_oldest_first_and_skips_unusable_entries() {
        let stored = json!({
            "version": 1,
            "views": {
                "@workspace": view(3),
                "folder-a": view(1),
                "broken": [],
                "": view(2),
            }
        });
        let operations = database_view_operations(Some(&stored));
        assert_eq!(
            operations,
            vec![
                WorkspaceOperation::SetDatabaseView {
                    folder_id: Some("folder-a".into()),
                    view: Some(view(1)),
                },
                WorkspaceOperation::SetDatabaseView {
                    folder_id: None,
                    view: Some(view(3)),
                },
            ]
        );
        assert!(database_view_operations(Some(&json!({ "version": 2, "views": {} }))).is_empty());
    }

    #[test]
    fn bounds_one_layout() {
        assert_eq!(validate_database_view(&view(1)), Ok(()));
        assert_eq!(
            validate_database_view(&json!([])),
            Err(OperationValidationError::InvalidDocument)
        );
        assert_eq!(
            validate_database_view(&json!({ "order": ["x".repeat(MAX_DATABASE_VIEW_BYTES)] })),
            Err(OperationValidationError::TooLong {
                field: "database layout",
                maximum: MAX_DATABASE_VIEW_BYTES,
            })
        );
    }
}
