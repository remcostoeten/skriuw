use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct ContentAnalysis {
    pub tags: Vec<String>,
    pub wikilinks: Vec<String>,
    pub mentions: Vec<String>,
    pub word_count: usize,
    pub char_count: usize,
}

/// Analyze markdown content for tags, wikilinks, mentions, and metrics.
/// Single-pass algorithm: compile regexes once, scan text sequentially.
pub fn analyze_content(markdown: &str) -> ContentAnalysis {
    let mut tags = HashSet::new();
    let mut wikilinks = HashSet::new();
    let mut mentions = HashSet::new();

    // Compile regexes once (shared across invocations in production)
    let tag_pattern = Regex::new(r"(^|[\s(\[{])#([a-zA-Z][a-zA-Z0-9_-]{1,31})\b").unwrap();
    let wikilink_pattern = Regex::new(r"\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]").unwrap();
    // Person mention: $Name or $Multi Word Name (capitalized words only for continuation)
    let mention_pattern = Regex::new(r"\$([A-Z][a-z]*(?:\s+[A-Z][a-z]*)*)").unwrap();

    // Extract tags
    for cap in tag_pattern.captures_iter(markdown) {
        if let Some(tag) = cap.get(2) {
            tags.insert(tag.as_str().to_string());
        }
    }

    // Extract wikilinks (full title from first capture group)
    for cap in wikilink_pattern.captures_iter(markdown) {
        if let Some(title) = cap.get(1) {
            wikilinks.insert(title.as_str().trim().to_string());
        }
    }

    // Extract mentions - capture group 1 has the name
    for cap in mention_pattern.captures_iter(markdown) {
        if let Some(mention) = cap.get(1) {
            mentions.insert(mention.as_str().trim().to_string());
        }
    }

    // Word count: split on Unicode whitespace, count non-empty
    let word_count = markdown
        .split(|c: char| c.is_whitespace())
        .filter(|w| !w.is_empty())
        .count();

    let char_count = markdown.chars().count();

    let mut tags_vec: Vec<_> = tags.into_iter().collect();
    tags_vec.sort();

    let mut wikilinks_vec: Vec<_> = wikilinks.into_iter().collect();
    wikilinks_vec.sort();

    let mut mentions_vec: Vec<_> = mentions.into_iter().collect();
    mentions_vec.sort();

    ContentAnalysis {
        tags: tags_vec,
        wikilinks: wikilinks_vec,
        mentions: mentions_vec,
        word_count,
        char_count,
    }
}

#[tauri::command]
pub fn analyze_note_content(markdown: String) -> ContentAnalysis {
    analyze_content(&markdown)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_tags() {
        let md = "Working on #project and #design planning";
        let analysis = analyze_content(md);
        assert_eq!(analysis.tags, vec!["design", "project"]);
    }

    #[test]
    fn test_extract_wikilinks() {
        let md = "See [[My Note]] and [[Another|Display Title]]";
        let analysis = analyze_content(md);
        assert_eq!(analysis.wikilinks, vec!["Another", "My Note"]);
    }

    #[test]
    fn test_extract_mentions() {
        let md = "Assigned to $Alice and $Bob Smith";
        let analysis = analyze_content(md);
        assert_eq!(analysis.mentions, vec!["Alice", "Bob Smith"]);
    }

    #[test]
    fn test_word_and_char_count() {
        let md = "Hello world";
        let analysis = analyze_content(md);
        assert_eq!(analysis.word_count, 2);
        assert_eq!(analysis.char_count, 11);
    }

    #[test]
    fn test_unicode_handling() {
        let md = "你好 мир café";
        let analysis = analyze_content(md);
        assert_eq!(analysis.word_count, 3);
        assert!(analysis.char_count > 0);
    }
}
