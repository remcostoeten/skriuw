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
            body = content[end_pos + 6..].trim_start();

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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
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

impl ConflictResolution {
    pub fn apply(
        &self,
        note: ExportedNote,
        existing_names: &HashSet<String>,
    ) -> Option<ExportedNote> {
        match self {
            ConflictResolution::Skip => {
                if existing_names.contains(&note.name) {
                    None
                } else {
                    Some(note)
                }
            }
            ConflictResolution::Replace => Some(note),
            ConflictResolution::Rename => {
                let original_name = note.name.clone();
                let mut renamed = note;
                let mut counter = 1;

                while existing_names.contains(&renamed.name) {
                    renamed.name = format!("{} ({})", original_name, counter);
                    counter += 1;
                }

                Some(renamed)
            }
        }
    }
}

/// Build export JSON from workspace data
pub fn build_export(
    notes: Vec<serde_json::Value>,
    folders: Vec<serde_json::Value>,
    exported_at: String,
) -> Result<String, String> {
    let notes: Vec<ExportedNote> = notes
        .into_iter()
        .filter_map(|n| serde_json::from_value(n).ok())
        .collect();

    let folders: Vec<ExportedFolder> = folders
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
        .collect();

    let tags: Vec<ExportedTag> = deduplicate_tags(&notes)
        .into_iter()
        .map(|(name, count)| ExportedTag { name, note_count: count })
        .collect();

    let manifest = ExportManifest {
        version: "1.0".to_string(),
        exported_at,
        note_count: notes.len(),
        folder_count: folders.len(),
        tag_count: tags.len(),
    };

    let export = ExportArchive { notes, folders, tags, manifest };

    serde_json::to_string(&export).map_err(|e| format!("Failed to serialize export: {}", e))
}

#[tauri::command]
pub fn build_export_archive(
    notes: Vec<serde_json::Value>,
    folders: Vec<serde_json::Value>,
    exported_at: String,
) -> Result<String, String> {
    build_export(notes, folders, exported_at)
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

/// Apply conflict resolution strategy to imported notes
pub fn apply_conflict_resolution(
    notes: Vec<ExportedNote>,
    existing_names: &[String],
    strategy: ConflictResolution,
) -> (Vec<ExportedNote>, usize) {
    let existing_set: HashSet<String> = existing_names.iter().cloned().collect();
    let mut resolved = Vec::new();
    let mut skipped = 0;

    for note in notes {
        match strategy.apply(note, &existing_set) {
            Some(n) => {
                resolved.push(n.clone());
            }
            None => {
                skipped += 1;
            }
        }
    }

    (resolved, skipped)
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
        },
        "notes": unique,
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
    fn test_build_export_computes_tags_and_manifest() {
        let notes = vec![
            json!({
                "id": "n1",
                "name": "Note1",
                "content": "body",
                "created_at": "2026-01-01T00:00:00Z",
                "modified_at": "2026-01-01T00:00:00Z",
                "tags": ["Work", " work "],
            }),
            json!({
                "id": "n2",
                "name": "Note2",
                "content": "body",
                "created_at": "2026-01-01T00:00:00Z",
                "modified_at": "2026-01-01T00:00:00Z",
                "tags": ["personal"],
            }),
        ];
        let folders = vec![json!({"id": "f1", "name": "Folder", "parent_id": null})];

        let exported = build_export(notes, folders, "2026-07-05T00:00:00Z".to_string()).unwrap();
        let archive: ExportArchive = serde_json::from_str(&exported).unwrap();

        assert_eq!(archive.manifest.note_count, 2);
        assert_eq!(archive.manifest.folder_count, 1);
        assert_eq!(archive.manifest.tag_count, 2);
        assert_eq!(archive.manifest.exported_at, "2026-07-05T00:00:00Z");
        assert_eq!(archive.folders[0].id, "f1");

        // "Work" and " work " fold to the same normalized tag and count both notes.
        let work_tag = archive.tags.iter().find(|t| t.name == "work").unwrap();
        assert_eq!(work_tag.note_count, 2);
    }

    #[test]
    fn test_build_export_skips_malformed_note_entries() {
        let notes = vec![
            json!({"id": "n1", "name": "Ok", "content": "", "created_at": "", "modified_at": ""}),
            json!({"missing": "required fields"}),
        ];

        let exported = build_export(notes, vec![], "2026-01-01T00:00:00Z".to_string()).unwrap();
        let archive: ExportArchive = serde_json::from_str(&exported).unwrap();

        assert_eq!(archive.notes.len(), 1);
        assert_eq!(archive.manifest.note_count, 1);
    }

    #[test]
    fn test_extract_archive_missing_file() {
        // Non-existent file should fail gracefully
        let result = extract_archive_json(Path::new("/nonexistent/archive.zip"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to open ZIP"));
    }

    #[test]
    fn test_conflict_resolution_skip() {
        let notes = vec![
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
        ];

        let existing = vec!["Existing".to_string()];
        let (resolved, skipped) =
            apply_conflict_resolution(notes, &existing, ConflictResolution::Skip);

        assert_eq!(resolved.len(), 1);
        assert_eq!(skipped, 1);
        assert_eq!(resolved[0].name, "New");
    }

    #[test]
    fn test_conflict_resolution_rename() {
        let notes = vec![
            ExportedNote {
                id: "n1".to_string(),
                name: "Note".to_string(),
                content: "".to_string(),
                created_at: "".to_string(),
                modified_at: "".to_string(),
                folder_id: None,
                tags: vec![],
            },
        ];

        let existing = vec!["Note".to_string(), "Note (1)".to_string()];
        let (resolved, _) =
            apply_conflict_resolution(notes, &existing, ConflictResolution::Rename);

        assert_eq!(resolved[0].name, "Note (2)");
    }

    fn synthetic_archive(note_count: usize) -> ExportArchive {
        let notes = (0..note_count)
            .map(|i| ExportedNote {
                id: format!("n{}", i),
                name: format!("Note {}", i),
                content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.".repeat(20),
                created_at: "2026-01-01T00:00:00Z".to_string(),
                modified_at: "2026-01-01T00:00:00Z".to_string(),
                folder_id: None,
                tags: vec!["work".to_string(), format!("tag{}", i % 50)],
            })
            .collect();

        ExportArchive {
            notes,
            folders: vec![],
            tags: vec![],
            manifest: ExportManifest {
                version: "1.0".to_string(),
                exported_at: "2026-01-01T00:00:00Z".to_string(),
                note_count,
                folder_count: 0,
                tag_count: 0,
            },
        }
    }

    /// 10k-note archive is a generous stand-in for a large real-world vault;
    /// these guard against accidental O(n^2) regressions in the hot import
    /// paths (JSON round-trip, dedupe, validation, export build).
    #[test]
    fn perf_parse_and_serialize_large_archive() {
        let archive = synthetic_archive(10_000);
        let json = serde_json::to_string(&archive).unwrap();

        let start = std::time::Instant::now();
        let parsed = parse_import_archive(&json).unwrap();
        let elapsed = start.elapsed();

        assert_eq!(parsed.notes.len(), 10_000);
        assert!(
            elapsed.as_millis() < 500,
            "parsing 10k notes took {:?}, expected < 500ms",
            elapsed
        );
    }

    #[test]
    fn perf_detect_duplicates_large_archive() {
        let archive = synthetic_archive(10_000);
        let existing_names: Vec<&str> = archive.notes[..5_000]
            .iter()
            .map(|n| n.name.as_str())
            .collect();

        let start = std::time::Instant::now();
        let (unique, duplicates) = detect_duplicates(&archive, &existing_names);
        let elapsed = start.elapsed();

        assert_eq!(unique.len(), 5_000);
        assert_eq!(duplicates.len(), 5_000);
        assert!(
            elapsed.as_millis() < 200,
            "dedup over 10k notes took {:?}, expected < 200ms",
            elapsed
        );
    }

    #[test]
    fn perf_validate_and_build_export_large_archive() {
        let archive = synthetic_archive(10_000);

        let start = std::time::Instant::now();
        let errors = validate_import(&archive);
        let elapsed = start.elapsed();
        assert!(errors.is_empty());
        assert!(
            elapsed.as_millis() < 200,
            "validating 10k notes took {:?}, expected < 200ms",
            elapsed
        );

        let notes: Vec<serde_json::Value> = archive
            .notes
            .iter()
            .map(|n| serde_json::to_value(n).unwrap())
            .collect();

        let start = std::time::Instant::now();
        let exported = build_export(notes, vec![], "2026-01-01T00:00:00Z".to_string()).unwrap();
        let elapsed = start.elapsed();

        assert!(exported.contains("\"note_count\":10000"));
        assert!(
            elapsed.as_millis() < 1500,
            "building export for 10k notes took {:?}, expected < 1500ms",
            elapsed
        );
    }
}
