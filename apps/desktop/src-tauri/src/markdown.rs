use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Rich text document block (matches TypeScript Block type)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(crate = "serde")]
#[serde(tag = "type")]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub enum BlockType {
    #[serde(rename = "paragraph")]
    Paragraph {
        #[serde(skip_serializing_if = "Option::is_none")]
        props: Option<serde_json::Value>,
        content: Vec<serde_json::Value>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        children: Vec<serde_json::Value>,
    },
    #[serde(rename = "heading")]
    Heading {
        props: serde_json::Value,
        content: Vec<serde_json::Value>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        children: Vec<serde_json::Value>,
    },
    #[serde(rename = "bulletListItem")]
    BulletListItem {
        #[serde(skip_serializing_if = "Option::is_none")]
        props: Option<serde_json::Value>,
        content: Vec<serde_json::Value>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        children: Vec<serde_json::Value>,
    },
    #[serde(rename = "numberedListItem")]
    NumberedListItem {
        #[serde(skip_serializing_if = "Option::is_none")]
        props: Option<serde_json::Value>,
        content: Vec<serde_json::Value>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        children: Vec<serde_json::Value>,
    },
    #[serde(rename = "checkListItem")]
    CheckListItem {
        props: serde_json::Value,
        content: Vec<serde_json::Value>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        children: Vec<serde_json::Value>,
    },
    #[serde(rename = "quote")]
    Quote {
        #[serde(skip_serializing_if = "Option::is_none")]
        props: Option<serde_json::Value>,
        content: Vec<serde_json::Value>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        children: Vec<serde_json::Value>,
    },
    #[serde(rename = "procode")]
    ProCode {
        props: serde_json::Value,
        content: String,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        children: Vec<serde_json::Value>,
    },
    #[serde(rename = "divider")]
    Divider {
        #[serde(skip_serializing_if = "Option::is_none")]
        props: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        content: Vec<serde_json::Value>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        children: Vec<serde_json::Value>,
    },
}

/// Parse markdown string to BlockNote-compatible rich document
pub fn markdown_to_rich_document(markdown: &str) -> Vec<serde_json::Value> {
    if markdown.trim().is_empty() {
        return vec![serde_json::json!({
            "type": "paragraph",
            "content": ""
        })];
    }

    let mut blocks = Vec::new();
    let lines: Vec<&str> = markdown.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();

        // Skip empty lines between blocks
        if trimmed.is_empty() {
            i += 1;
            continue;
        }

        // Headings: # Title, ## Subtitle, etc
        if trimmed.starts_with('#') {
            let (block, consumed) = parse_heading(trimmed);
            blocks.push(block);
            i += consumed;
            continue;
        }

        // Unordered lists: - item
        if trimmed.starts_with("- ") {
            let (items, consumed) = parse_unordered_list(&lines, i);
            blocks.extend(items);
            i += consumed;
            continue;
        }

        // Ordered lists: 1. item
        if is_ordered_list_start(trimmed) {
            let (items, consumed) = parse_ordered_list(&lines, i);
            blocks.extend(items);
            i += consumed;
            continue;
        }

        // Checkboxes: - [x] or - [ ]
        if trimmed.starts_with("- [") {
            let (items, consumed) = parse_checklist(&lines, i);
            blocks.extend(items);
            i += consumed;
            continue;
        }

        // Blockquotes: > quote
        if trimmed.starts_with("> ") {
            let (block, consumed) = parse_blockquote(&lines, i);
            blocks.push(block);
            i += consumed;
            continue;
        }

        // Code fences: ```language
        if trimmed.starts_with("```") {
            let (block, consumed) = parse_code_block(&lines, i);
            blocks.push(block);
            i += consumed;
            continue;
        }

        // Horizontal rule: ---, ***, ___
        if is_horizontal_rule(trimmed) {
            blocks.push(serde_json::json!({
                "type": "divider"
            }));
            i += 1;
            continue;
        }

        // Default: paragraph
        let (block, consumed) = parse_paragraph(&lines, i);
        blocks.push(block);
        i += consumed;
    }

    if blocks.is_empty() {
        return vec![serde_json::json!({
            "type": "paragraph",
            "content": ""
        })];
    }

    blocks
}

fn parse_heading(line: &str) -> (serde_json::Value, usize) {
    let level = line.chars().take_while(|c| *c == '#').count().min(6).max(1);
    let title = line[level..].trim();

    (
        json!({
            "type": "heading",
            "props": { "level": level },
            "content": parse_inline_content(title)
        }),
        1,
    )
}

fn parse_unordered_list(lines: &[&str], start: usize) -> (Vec<serde_json::Value>, usize) {
    let mut items = Vec::new();
    let mut i = start;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();

        if !trimmed.starts_with("- ") {
            break;
        }

        let content = trimmed[2..].trim();
        items.push(json!({
            "type": "bulletListItem",
            "content": parse_inline_content(content)
        }));
        i += 1;
    }

    (items, i - start)
}

fn parse_ordered_list(lines: &[&str], start: usize) -> (Vec<serde_json::Value>, usize) {
    let mut items = Vec::new();
    let mut i = start;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();

        if !is_ordered_list_start(trimmed) {
            break;
        }

        if let Some(dot_pos) = trimmed.find(". ") {
            let content = trimmed[dot_pos + 2..].trim();
            items.push(json!({
                "type": "numberedListItem",
                "content": parse_inline_content(content)
            }));
        }
        i += 1;
    }

    (items, i - start)
}

fn parse_checklist(lines: &[&str], start: usize) -> (Vec<serde_json::Value>, usize) {
    let mut items = Vec::new();
    let mut i = start;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();

        if !trimmed.starts_with("- [") {
            break;
        }

        let checked = trimmed.contains("[x]") || trimmed.contains("[X]");
        let content = if let Some(close_bracket) = trimmed.find("] ") {
            trimmed[close_bracket + 2..].trim()
        } else {
            ""
        };

        items.push(json!({
            "type": "checkListItem",
            "props": { "checked": checked },
            "content": parse_inline_content(content)
        }));
        i += 1;
    }

    (items, i - start)
}

fn parse_blockquote(lines: &[&str], start: usize) -> (serde_json::Value, usize) {
    let mut quote_lines = Vec::new();
    let mut i = start;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();

        if !trimmed.starts_with("> ") {
            break;
        }

        quote_lines.push(trimmed[2..].trim());
        i += 1;
    }

    let content = quote_lines.join("\n");
    (
        json!({
            "type": "quote",
            "content": parse_inline_content(&content)
        }),
        i - start,
    )
}

fn parse_code_block(lines: &[&str], start: usize) -> (serde_json::Value, usize) {
    let fence_line = lines[start].trim();
    let language = fence_line[3..].trim();

    let mut code_lines = Vec::new();
    let mut i = start + 1;

    while i < lines.len() {
        let line = lines[i];
        if line.trim() == "```" {
            break;
        }
        code_lines.push(line);
        i += 1;
    }

    let content = code_lines.join("\n");
    (
        json!({
            "type": "procode",
            "props": { "language": if language.is_empty() { "text" } else { language } },
            "content": content
        }),
        i + 1 - start,
    )
}

fn parse_paragraph(lines: &[&str], start: usize) -> (serde_json::Value, usize) {
    let line = lines[start];
    (
        json!({
            "type": "paragraph",
            "content": parse_inline_content(line.trim())
        }),
        1,
    )
}

fn is_ordered_list_start(line: &str) -> bool {
    let trimmed = line.trim();
    if !trimmed.starts_with(char::is_numeric) {
        return false;
    }
    trimmed.contains(". ")
}

fn is_horizontal_rule(line: &str) -> bool {
    let trimmed = line.trim();
    (trimmed.starts_with("---") && trimmed.chars().all(|c| c == '-' || c.is_whitespace()))
        || (trimmed.starts_with("***") && trimmed.chars().all(|c| c == '*' || c.is_whitespace()))
        || (trimmed.starts_with("___") && trimmed.chars().all(|c| c == '_' || c.is_whitespace()))
}

/// Parse inline content with markdown formatting (bold, italic, code, links, etc)
fn parse_inline_content(text: &str) -> Vec<serde_json::Value> {
    if text.is_empty() {
        return vec![];
    }

    let mut result = Vec::new();
    let mut remaining = text;

    // Compile regexes for inline elements
    let bold_re = Regex::new(r"\*\*(.*?)\*\*").unwrap();
    let italic_re = Regex::new(r"\*(.*?)\*").unwrap();
    let strike_re = Regex::new(r"~~(.*?)~~").unwrap();
    let code_re = Regex::new(r"`([^`]+?)`").unwrap();
    let wikilink_re = Regex::new(r"\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]").unwrap();
    let link_re = Regex::new(r"\[([^\]]+?)\]\(([^)]+?)\)").unwrap();
    let tag_re = Regex::new(r"#([a-zA-Z][a-zA-Z0-9_-]{1,31})").unwrap();
    let mention_re = Regex::new(r"\$([A-Z][a-z]*(?:\s+[A-Z][a-z]*)*)").unwrap();

    let mut pos = 0;
    let text_bytes = text.as_bytes();

    while pos < text.len() {
        // Try to find next formatting element
        let mut earliest = None;
        let mut earliest_type = "";

        // Check for bold
        if let Some(m) = bold_re.find(&text[pos..]) {
            let abs_pos = pos + m.start();
            if earliest.is_none() || abs_pos < earliest.unwrap() {
                earliest = Some(abs_pos);
                earliest_type = "bold";
            }
        }

        // Check for wikilinks (higher priority - check before other patterns)
        if let Some(m) = wikilink_re.find(&text[pos..]) {
            let abs_pos = pos + m.start();
            if earliest.is_none() || abs_pos < earliest.unwrap() {
                earliest = Some(abs_pos);
                earliest_type = "wikilink";
            }
        }

        // Check for code
        if let Some(m) = code_re.find(&text[pos..]) {
            let abs_pos = pos + m.start();
            if earliest.is_none() || abs_pos < earliest.unwrap() {
                earliest = Some(abs_pos);
                earliest_type = "code";
            }
        }

        // Check for strike
        if let Some(m) = strike_re.find(&text[pos..]) {
            let abs_pos = pos + m.start();
            if earliest.is_none() || abs_pos < earliest.unwrap() {
                earliest = Some(abs_pos);
                earliest_type = "strike";
            }
        }

        // Check for links
        if let Some(m) = link_re.find(&text[pos..]) {
            let abs_pos = pos + m.start();
            if earliest.is_none() || abs_pos < earliest.unwrap() {
                earliest = Some(abs_pos);
                earliest_type = "link";
            }
        }

        // Check for italic (after bold, since ** is checked first)
        if let Some(m) = italic_re.find(&text[pos..]) {
            let abs_pos = pos + m.start();
            if earliest.is_none() || abs_pos < earliest.unwrap() {
                earliest = Some(abs_pos);
                earliest_type = "italic";
            }
        }

        if let Some(earliest_pos) = earliest {
            // Add plain text before the formatting
            if earliest_pos > pos {
                result.push(json!({
                    "type": "text",
                    "text": &text[pos..earliest_pos]
                }));
            }

            // Add the formatted element
            match earliest_type {
                "bold" => {
                    if let Some(caps) = bold_re.captures(&text[earliest_pos..]) {
                        if let Some(content) = caps.get(1) {
                            result.push(json!({
                                "type": "text",
                                "text": content.as_str(),
                                "styles": { "bold": true }
                            }));
                            pos = earliest_pos + caps.get(0).unwrap().len();
                        }
                    }
                }
                "italic" => {
                    if let Some(caps) = italic_re.captures(&text[earliest_pos..]) {
                        if let Some(content) = caps.get(1) {
                            result.push(json!({
                                "type": "text",
                                "text": content.as_str(),
                                "styles": { "italic": true }
                            }));
                            pos = earliest_pos + caps.get(0).unwrap().len();
                        }
                    }
                }
                "strike" => {
                    if let Some(caps) = strike_re.captures(&text[earliest_pos..]) {
                        if let Some(content) = caps.get(1) {
                            result.push(json!({
                                "type": "text",
                                "text": content.as_str(),
                                "styles": { "strike": true }
                            }));
                            pos = earliest_pos + caps.get(0).unwrap().len();
                        }
                    }
                }
                "code" => {
                    if let Some(caps) = code_re.captures(&text[earliest_pos..]) {
                        if let Some(content) = caps.get(1) {
                            result.push(json!({
                                "type": "text",
                                "text": content.as_str(),
                                "styles": { "code": true }
                            }));
                            pos = earliest_pos + caps.get(0).unwrap().len();
                        }
                    }
                }
                "wikilink" => {
                    if let Some(caps) = wikilink_re.captures(&text[earliest_pos..]) {
                        if let Some(title) = caps.get(1) {
                            result.push(json!({
                                "type": "noteLink",
                                "props": { "title": title.as_str().trim() }
                            }));
                            pos = earliest_pos + caps.get(0).unwrap().len();
                        }
                    }
                }
                "link" => {
                    if let Some(caps) = link_re.captures(&text[earliest_pos..]) {
                        if let (Some(label), Some(href)) = (caps.get(1), caps.get(2)) {
                            result.push(json!({
                                "type": "link",
                                "href": href.as_str(),
                                "content": parse_inline_content(label.as_str())
                            }));
                            pos = earliest_pos + caps.get(0).unwrap().len();
                        }
                    }
                }
                _ => {
                    pos = earliest_pos + 1;
                }
            }
        } else {
            // No more formatting found, add remaining text
            result.push(json!({
                "type": "text",
                "text": &text[pos..]
            }));
            break;
        }
    }

    if result.is_empty() {
        result.push(json!({
            "type": "text",
            "text": text
        }));
    }

    result
}

#[tauri::command]
pub fn markdown_to_rich(markdown: String) -> Vec<serde_json::Value> {
    markdown_to_rich_document(&markdown)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_empty() {
        let result = markdown_to_rich_document("");
        assert!(!result.is_empty());
    }

    #[test]
    fn test_parse_heading() {
        let result = markdown_to_rich_document("# Title");
        assert_eq!(result[0]["type"], "heading");
        assert!(result[0]["content"].is_array());
        assert_eq!(result[0]["content"][0]["text"], "Title");
    }

    #[test]
    fn test_parse_list() {
        let result = markdown_to_rich_document("- item one\n- item two");
        assert_eq!(result.len(), 2);
        assert_eq!(result[0]["type"], "bulletListItem");
    }

    #[test]
    fn test_parse_code_block() {
        let md = "```rust\nfn main() {}\n```";
        let result = markdown_to_rich_document(md);
        assert_eq!(result[0]["type"], "procode");
        assert_eq!(result[0]["props"]["language"], "rust");
    }
}
