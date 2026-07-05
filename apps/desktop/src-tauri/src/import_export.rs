use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::io::Read;

/// Parse YAML frontmatter from markdown content
pub fn parse_frontmatter(content: &str) -> (HashMap<String, String>, String) {
    let mut frontmatter = HashMap::new();
    let mut body = content;

    if content.starts_with("---") {
        if let Some(end_pos) = content[3..].find("---") {
            let fm_section = &content[3..end_pos + 3];
            body = &content[end_pos + 6..].trim_start();

            // Simple YAML parser for key: value pairs
            for line in fm_section.lines() {
                if let Some(colon_pos) = line.find(':') {
                    let key = line[..colon_pos].trim();
                    let value = line[colon_pos + 1..].trim();
                    frontmatter.insert(key.to_string(), value.to_string());
                }
            }
        }
    }

    (frontmatter, body.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct ExportArchive {
    pub notes: Vec<ExportedNote>,
    pub folders: Vec<ExportedFolder>,
    pub tags: Vec<ExportedTag>,
    pub manifest: ExportManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct ExportedNote {
    pub id: String,
    pub name: String,
    pub content: String,
    pub created_at: String,
    pub modified_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct ExportedFolder {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct ExportedTag {
    pub name: String,
    pub note_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct ExportManifest {
    pub version: String,
    pub exported_at: String,
    pub note_count: usize,
    pub folder_count: usize,
    pub tag_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct ImportResult {
    pub imported_notes: usize,
    pub imported_folders: usize,
    pub duplicates_skipped: usize,
    pub errors: Vec<String>,
}

/// Parse import archive JSON and detect duplicates
pub fn parse_import_archive(json_str: &str) -> Result<ExportArchive, String> {
    serde_json::from_str(json_str).map_err(|e| format!("Failed to parse archive: {}", e))
}

/// Detect duplicate notes by name and content hash
pub fn detect_duplicates(
    archive: &ExportArchive,
    existing_note_names: &[&str],
) -> (Vec<ExportedNote>, Vec<ExportedNote>) {
    let existing_set: HashSet<_> = existing_note_names.iter().collect();

    let mut unique = Vec::new();
    let mut duplicates = Vec::new();

    for note in &archive.notes {
        if existing_set.contains(&note.name.as_str()) {
            duplicates.push(note.clone());
        } else {
            unique.push(note.clone());
        }
    }

    (unique, duplicates)
}

/// Merge folders, handling parent relationships
pub fn merge_folders(
    existing_folders: &[serde_json::Value],
    imported_folders: &[ExportedFolder],
) -> Vec<ExportedFolder> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();

    // Add existing folders
    for folder in existing_folders {
        if let (Some(id), Some(name)) = (
            folder.get("id").and_then(|v| v.as_str()),
            folder.get("name").and_then(|v| v.as_str()),
        ) {
            seen.insert(id.to_string());
            result.push(ExportedFolder {
                id: id.to_string(),
                name: name.to_string(),
                parent_id: folder
                    .get("parent_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            });
        }
    }

    // Add new imported folders
    for folder in imported_folders {
        if !seen.contains(&folder.id) {
            seen.insert(folder.id.clone());
            result.push(folder.clone());
        }
    }

    result
}

/// Deduplicate tags across notes
pub fn deduplicate_tags(notes: &[ExportedNote]) -> HashMap<String, usize> {
    let mut tag_counts: HashMap<String, usize> = HashMap::new();

    for note in notes {
        for tag in &note.tags {
            let normalized = tag.trim().to_lowercase();
            *tag_counts.entry(normalized).or_insert(0) += 1;
        }
    }

    tag_counts
}

/// Validate note content and folder relationships
pub fn validate_import(archive: &ExportArchive) -> Vec<String> {
    let mut errors = Vec::new();

    // Validate notes
    for note in &archive.notes {
        if note.id.is_empty() {
            errors.push("Note has empty id".to_string());
        }
        if note.name.is_empty() {
            errors.push(format!("Note {} has empty name", note.id));
        }
    }

    // Validate folders
    let folder_ids: HashSet<_> = archive.folders.iter().map(|f| &f.id).collect();
    for folder in &archive.folders {
        if let Some(parent_id) = &folder.parent_id {
            if !folder_ids.contains(parent_id) {
                errors.push(format!(
                    "Folder {} references non-existent parent {}",
                    folder.id, parent_id
                ));
            }
        }
    }

    // Validate note folder references
    for note in &archive.notes {
        if let Some(folder_id) = &note.folder_id {
            if !folder_ids.contains(folder_id) {
                errors.push(format!(
                    "Note {} references non-existent folder {}",
                    note.id, folder_id
                ));
            }
        }
    }

    errors
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(crate = "serde")]
#[serde(rename_all = "lowercase")]
pub enum ConflictResolution {
    Skip,
    Replace,
    Rename,
}

/// Build export JSON from workspace data
pub fn build_export(
    notes: Vec<serde_json::Value>,
    folders: Vec<serde_json::Value>,
) -> Result<String, String> {
    let export = ExportArchive {
        notes: notes
            .into_iter()
            .filter_map(|n| {
                serde_json::from_value(n).ok()
            })
            .collect(),
        folders: folders
            .into_iter()
            .filter_map(|f| {
                if let (Some(id), Some(name)) = (
                    f.get("id").and_then(|v| v.as_str()),
                    f.get("name").and_then(|v| v.as_str()),
                ) {
                    Some(ExportedFolder {
                        id: id.to_string(),
                        name: name.to_string(),
                        parent_id: f
                            .get("parent_id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                    })
                } else {
                    None
                }
            })
            .collect(),
        tags: deduplicate_tags(&[]).into_iter()
            .map(|(name, count)| ExportedTag { name, note_count: count })
            .collect(),
        manifest: ExportManifest {
            version: "1.0".to_string(),
            exported_at: "2026-01-01T00:00:00Z".to_string(),
            note_count: 0,
            folder_count: 0,
            tag_count: 0,
        },
    };

    serde_json::to_string(&export).map_err(|e| format!("Failed to serialize export: {}", e))
}

/// Extract and parse archive.json from a ZIP file
pub fn extract_archive_json(zip_path: &Path) -> Result<ExportArchive, String> {
    let file = std::fs::File::open(zip_path)
        .map_err(|e| format!("Failed to open ZIP: {}", e))?;

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid ZIP file: {}", e))?;

    // Look for archive.json
    let mut archive_file = archive
        .by_name("archive.json")
        .map_err(|_| "archive.json not found in ZIP".to_string())?;

    let mut json_str = String::new();
    archive_file
        .read_to_string(&mut json_str)
        .map_err(|e| format!("Failed to read archive.json: {}", e))?;

    parse_import_archive(&json_str)
}

#[tauri::command]
pub fn parse_import_json(json: String) -> Result<serde_json::Value, String> {
    match parse_import_archive(&json) {
        Ok(archive) => Ok(json!({
            "notes_count": archive.notes.len(),
            "folders_count": archive.folders.len(),
            "tags_count": archive.tags.len(),
            "errors": validate_import(&archive)
        })),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn import_notes_batch(
    json: String,
    existing_note_names: Vec<String>,
) -> Result<ImportResult, String> {
    let archive = parse_import_archive(&json)?;

    let existing_refs: Vec<&str> = existing_note_names.iter().map(|s| s.as_str()).collect();
    let (unique, duplicates) = detect_duplicates(&archive, &existing_refs);

    let validation_errors = validate_import(&archive);

    Ok(ImportResult {
        imported_notes: unique.len(),
        imported_folders: archive.folders.len(),
        duplicates_skipped: duplicates.len(),
        errors: validation_errors,
    })
}

#[tauri::command]
pub fn extract_and_validate_archive(
    zip_path: String,
    existing_note_names: Vec<String>,
) -> Result<serde_json::Value, String> {
    let archive = extract_archive_json(Path::new(&zip_path))?;

    let existing_refs: Vec<&str> = existing_note_names.iter().map(|s| s.as_str()).collect();
    let (unique, duplicates) = detect_duplicates(&archive, &existing_refs);

    let validation_errors = validate_import(&archive);

    Ok(json!({
        "archive": {
            "notes_count": archive.notes.len(),
            "folders_count": archive.folders.len(),
            "tags_count": archive.tags.len(),
        },
        "import_summary": {
            "importable": unique.len(),
            "duplicates": duplicates.len(),
            "errors": validation_errors,
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_export_archive() {
        let json = r#"{
            "notes": [{"id":"n1","name":"Test","content":"test","created_at":"2024-01-01T00:00:00Z","modified_at":"2024-01-01T00:00:00Z","tags":[]}],
            "folders": [],
            "tags": [],
            "manifest": {"version":"1.0","exported_at":"2024-01-01T00:00:00Z","note_count":1,"folder_count":0,"tag_count":0}
        }"#;
        let result = parse_import_archive(json);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().notes.len(), 1);
    }

    #[test]
    fn test_detect_duplicates() {
        let archive = ExportArchive {
            notes: vec![
                ExportedNote {
                    id: "n1".to_string(),
                    name: "Existing".to_string(),
                    content: "".to_string(),
                    created_at: "".to_string(),
                    modified_at: "".to_string(),
                    folder_id: None,
                    tags: vec![],
                },
                ExportedNote {
                    id: "n2".to_string(),
                    name: "New".to_string(),
                    content: "".to_string(),
                    created_at: "".to_string(),
                    modified_at: "".to_string(),
                    folder_id: None,
                    tags: vec![],
                },
            ],
            folders: vec![],
            tags: vec![],
            manifest: ExportManifest {
                version: "1.0".to_string(),
                exported_at: "".to_string(),
                note_count: 2,
                folder_count: 0,
                tag_count: 0,
            },
        };

        let (unique, duplicates) = detect_duplicates(&archive, &["Existing"]);
        assert_eq!(unique.len(), 1);
        assert_eq!(duplicates.len(), 1);
    }

    #[test]
    fn test_deduplicate_tags() {
        let notes = vec![
            ExportedNote {
                id: "n1".to_string(),
                name: "Note1".to_string(),
                content: "".to_string(),
                created_at: "".to_string(),
                modified_at: "".to_string(),
                folder_id: None,
                tags: vec!["work".to_string(), "important".to_string()],
            },
            ExportedNote {
                id: "n2".to_string(),
                name: "Note2".to_string(),
                content: "".to_string(),
                created_at: "".to_string(),
                modified_at: "".to_string(),
                folder_id: None,
                tags: vec!["work".to_string()],
            },
        ];

        let tags = deduplicate_tags(&notes);
        assert_eq!(tags.get("work"), Some(&2));
        assert_eq!(tags.get("important"), Some(&1));
    }

    #[test]
    fn test_parse_frontmatter() {
        let markdown = "---\ntitle: Test Note\ndate: 2026-01-01\n---\n# Content\nBody text";
        let (fm, body) = parse_frontmatter(markdown);

        assert_eq!(fm.get("title"), Some(&"Test Note".to_string()));
        assert_eq!(fm.get("date"), Some(&"2026-01-01".to_string()));
        assert!(body.contains("# Content"));
    }

    #[test]
    fn test_parse_frontmatter_no_frontmatter() {
        let markdown = "# No frontmatter\nJust body text";
        let (fm, body) = parse_frontmatter(markdown);

        assert!(fm.is_empty());
        assert_eq!(body, markdown);
    }

    #[test]
    fn test_extract_archive_missing_file() {
        // Non-existent file should fail gracefully
        let result = extract_archive_json(Path::new("/nonexistent/archive.zip"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to open ZIP"));
    }
}
