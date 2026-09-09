use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Version of the text projected into the full-text index. A workspace stores
/// the version its index was built with; a mismatch means the index holds text
/// this build no longer produces and has to be rebuilt before its ranking and
/// snippets can be trusted. Bump it in the same commit as any change to
/// [`index_text`] or to the tokenizer.
pub const SEARCH_INDEX_VERSION: u32 = 2;

/// Fenced blocks whose body is a serialized payload rather than prose. Their
/// content is deliberately withheld from the index: a drawing scene is tens of
/// kilobytes of coordinates and identifiers that match nothing a reader would
/// search for, and would otherwise dominate both the term statistics and the
/// snippets.
const OPAQUE_FENCE_LANGUAGES: &[&str] = &["drawing", "excalidraw"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchIndexStatus {
    /// Version the stored index was built with, or `0` when no version was
    /// ever recorded — a pre-versioning workspace, which always rebuilds once.
    pub index_version: u32,
    pub current_version: u32,
    pub indexed_notes: u32,
    pub note_count: u32,
    pub needs_rebuild: bool,
}

/// Reduces a note's canonical Markdown to the prose a reader would search for.
///
/// Markdown syntax, HTML, editor markers, link targets, and opaque fenced
/// payloads are removed; the visible label of a link, wikilink, tag, or person
/// chip is kept so `#design` is found by searching `design`. Code fences keep
/// their body verbatim, because code is text a reader searches for.
pub fn index_text(markdown: &str) -> String {
    let mut text = String::with_capacity(markdown.len());
    let mut fence: Option<Fence> = None;
    for line in markdown.lines() {
        if let Some(active) = fence.as_ref() {
            if closes_fence(line, active) {
                fence = None;
            } else if !active.opaque {
                push_line(&mut text, line.trim_end());
            }
            continue;
        }
        if let Some(opened) = open_fence(line) {
            fence = Some(opened);
            continue;
        }
        let block = strip_block_markers(line);
        if block.is_empty() {
            continue;
        }
        push_line(&mut text, &inline_text(block));
    }
    text
}

struct Fence {
    marker: char,
    width: usize,
    opaque: bool,
}

fn open_fence(line: &str) -> Option<Fence> {
    let trimmed = line.trim_start();
    let marker = trimmed.chars().next().filter(|c| *c == '`' || *c == '~')?;
    let width = trimmed.chars().take_while(|c| *c == marker).count();
    if width < 3 {
        return None;
    }
    let language = trimmed[width..]
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    Some(Fence {
        marker,
        width,
        opaque: OPAQUE_FENCE_LANGUAGES.contains(&language.as_str()),
    })
}

fn closes_fence(line: &str, fence: &Fence) -> bool {
    let trimmed = line.trim();
    !trimmed.is_empty()
        && trimmed.chars().all(|c| c == fence.marker)
        && trimmed.chars().count() >= fence.width
}

fn push_line(text: &mut String, line: &str) {
    let line = line.trim();
    if line.is_empty() {
        return;
    }
    if !text.is_empty() {
        text.push('\n');
    }
    text.push_str(line);
}

fn strip_block_markers(line: &str) -> &str {
    let mut rest = line.trim();
    if is_thematic_break(rest) || is_table_delimiter(rest) {
        return "";
    }
    loop {
        let start = rest;
        rest = strip_quote(rest);
        rest = strip_bullet(rest);
        rest = strip_ordered(rest);
        rest = strip_heading(rest);
        rest = strip_item_state(rest);
        if rest.len() == start.len() {
            return rest;
        }
    }
}

fn strip_quote(line: &str) -> &str {
    line.strip_prefix('>').map_or(line, str::trim_start)
}

fn strip_bullet(line: &str) -> &str {
    for marker in ["- ", "* ", "+ "] {
        if let Some(rest) = line.strip_prefix(marker) {
            return rest.trim_start();
        }
    }
    line
}

fn strip_ordered(line: &str) -> &str {
    let digits = line.chars().take_while(char::is_ascii_digit).count();
    if digits == 0 || digits > 9 {
        return line;
    }
    let rest = &line[digits..];
    for marker in [". ", ") "] {
        if let Some(rest) = rest.strip_prefix(marker) {
            return rest.trim_start();
        }
    }
    line
}

fn strip_heading(line: &str) -> &str {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if hashes == 0 || hashes > 6 {
        return line;
    }
    line[hashes..]
        .strip_prefix(' ')
        .unwrap_or(line)
        .trim_start()
}

/// Check-list and toggle-list state markers the product serializer writes
/// ahead of the item's own text.
fn strip_item_state(line: &str) -> &str {
    for marker in ["[x] ", "[X] ", "[ ] ", "[v] ", "[>] "] {
        if let Some(rest) = line.strip_prefix(marker) {
            return rest.trim_start();
        }
    }
    line
}

fn is_thematic_break(line: &str) -> bool {
    let marker = match line.chars().next() {
        Some(first @ ('-' | '*' | '_')) => first,
        _ => return false,
    };
    line.chars().filter(|c| !c.is_whitespace()).count() >= 3
        && line.chars().all(|c| c == marker || c.is_whitespace())
}

fn is_table_delimiter(line: &str) -> bool {
    line.starts_with('|')
        && line.contains('-')
        && line
            .chars()
            .all(|c| matches!(c, '|' | '-' | ':') || c.is_whitespace())
}

fn inline_text(line: &str) -> String {
    let source: Vec<char> = line.chars().collect();
    let mut text = String::with_capacity(line.len());
    let mut index = 0;
    while index < source.len() {
        let character = source[index];
        match character {
            '\\' if index + 1 < source.len() && source[index + 1].is_ascii_punctuation() => {
                text.push(source[index + 1]);
                index += 2;
            }
            '<' => {
                if let Some(next) = skip_markup(&source, index) {
                    index = next;
                } else if let Some((url, next)) = read_autolink(&source, index) {
                    text.push_str(&url);
                    index = next;
                } else {
                    text.push('<');
                    index += 1;
                }
            }
            '!' if source.get(index + 1) == Some(&'[') => match read_link(&source, index + 1) {
                Some((label, next)) => {
                    text.push_str(&inline_text(&label));
                    index = next;
                }
                None => {
                    text.push('!');
                    index += 1;
                }
            },
            '[' if source.get(index + 1) == Some(&'[') => match read_wikilink(&source, index) {
                Some((label, next)) => {
                    text.push_str(&label);
                    index = next;
                }
                None => {
                    text.push('[');
                    index += 1;
                }
            },
            '[' => match read_link(&source, index) {
                Some((label, next)) => {
                    text.push_str(&inline_text(&label));
                    index = next;
                }
                None => {
                    text.push('[');
                    index += 1;
                }
            },
            '#' | '$' if starts_chip(&source, index, &text) => {
                index += 1;
            }
            '*' | '~' | '`' => {
                index += 1;
            }
            _ => {
                text.push(character);
                index += 1;
            }
        }
    }
    collapse_spaces(&text)
}

/// Consumes an HTML comment or tag starting at `open`, returning the index
/// just past it. An autolink (`<https://example.test>`) is not markup: its URL
/// is text a reader can reasonably search for, so it is left alone.
fn skip_markup(source: &[char], open: usize) -> Option<usize> {
    if source[open + 1..].starts_with(&['!', '-', '-']) {
        return find_sequence(source, open + 4, &['-', '-', '>']).map(|end| end + 3);
    }
    let first = *source.get(open + 1)?;
    if !(first.is_ascii_alphabetic() || first == '/') {
        return None;
    }
    let end = source[open + 1..]
        .iter()
        .position(|c| *c == '>' || *c == '<')?
        + open
        + 1;
    if source[end] != '>' {
        return None;
    }
    if source[open + 1..end].contains(&':') && !source[open + 1..end].contains(&'=') {
        return None;
    }
    Some(end + 1)
}

/// Reads `<https://example.test>` at `open`, yielding the bare URL. An
/// autolink is text a reader can search for, so only its delimiters go.
fn read_autolink(source: &[char], open: usize) -> Option<(String, usize)> {
    let end = source[open + 1..]
        .iter()
        .position(|c| *c == '>' || c.is_whitespace() || *c == '<')?
        + open
        + 1;
    if source[end] != '>' {
        return None;
    }
    let inner: String = source[open + 1..end].iter().collect();
    let scheme = inner.split_once(':')?.0;
    if scheme.is_empty()
        || !scheme
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+')
    {
        return None;
    }
    Some((inner, end + 1))
}

fn find_sequence(source: &[char], from: usize, needle: &[char]) -> Option<usize> {
    if from >= source.len() {
        return None;
    }
    source[from..]
        .windows(needle.len())
        .position(|window| window == needle)
        .map(|offset| offset + from)
}

/// Reads `[label](target)` or `[label][reference]` at `open`, yielding the
/// label and the index just past the whole construct.
fn read_link(source: &[char], open: usize) -> Option<(String, usize)> {
    let mut depth = 0usize;
    let mut close = None;
    for (offset, character) in source[open..].iter().enumerate() {
        match character {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    close = Some(open + offset);
                    break;
                }
            }
            _ => {}
        }
    }
    let close = close?;
    let label: String = source[open + 1..close].iter().collect();
    let (opener, closer) = match source.get(close + 1) {
        Some('(') => ('(', ')'),
        Some('[') => ('[', ']'),
        _ => return Some((label, close + 1)),
    };
    let _ = opener;
    let end = source[close + 2..].iter().position(|c| *c == closer)? + close + 2;
    Some((label, end + 1))
}

/// Reads `[[label]]` or `[[target|label]]`, keeping both sides so a note found
/// by its target name is also found by the text the reader sees.
fn read_wikilink(source: &[char], open: usize) -> Option<(String, usize)> {
    let end = find_sequence(source, open + 2, &[']', ']'])?;
    let inner: String = source[open + 2..end].iter().collect();
    if inner.is_empty() || inner.contains('\n') {
        return None;
    }
    Some((inner.replace('|', " "), end + 2))
}

/// A sigil only opens a chip at the start of a word and only when a label
/// follows, so `C#` and `US$` keep their punctuation while `#design` and
/// `$ada` index as their bare names.
fn starts_chip(source: &[char], index: usize, emitted: &str) -> bool {
    let follows_word = emitted
        .chars()
        .next_back()
        .is_some_and(|previous| previous.is_alphanumeric() || previous == '_');
    !follows_word
        && source
            .get(index + 1)
            .is_some_and(|next| next.is_alphanumeric())
}

fn collapse_spaces(text: &str) -> String {
    let mut collapsed = String::with_capacity(text.len());
    let mut pending_space = false;
    for character in text.chars() {
        if character.is_whitespace() {
            pending_space = !collapsed.is_empty();
            continue;
        }
        if pending_space {
            collapsed.push(' ');
            pending_space = false;
        }
        collapsed.push(character);
    }
    collapsed
}

#[cfg(test)]
mod tests {
    use super::{SEARCH_INDEX_VERSION, index_text};

    #[test]
    fn keeps_prose_and_drops_heading_and_emphasis_syntax() {
        assert_eq!(
            index_text("## <!--skriuw-align:center-->Release **notes**\n\nShipped *today*."),
            "Release notes\nShipped today."
        );
    }

    #[test]
    fn keeps_chip_labels_without_their_sigils() {
        assert_eq!(
            index_text("Reviewed with $ada under #design-system and [[Roadmap]]."),
            "Reviewed with ada under design-system and Roadmap."
        );
    }

    #[test]
    fn keeps_both_sides_of_an_aliased_wikilink() {
        assert_eq!(
            index_text("See [[2026-Q1 Plan|the plan]]."),
            "See 2026-Q1 Plan the plan."
        );
    }

    #[test]
    fn keeps_link_labels_and_drops_targets() {
        assert_eq!(
            index_text(
                "![Kitchen sketch](images/9f3c-uuid) and [the brief](https://example.test/brief)"
            ),
            "Kitchen sketch and the brief"
        );
    }

    #[test]
    fn keeps_bare_urls_that_are_not_markup() {
        assert_eq!(
            index_text("Mirror: <https://example.test/wiki>"),
            "Mirror: https://example.test/wiki"
        );
    }

    #[test]
    fn drops_editor_markers_and_html_marks() {
        assert_eq!(
            index_text(
                "- [x] Ship it <!--skriuw-task:9f3c-->\n<mark data-skriuw-highlight=\"yellow\">urgent</mark>"
            ),
            "Ship it\nurgent"
        );
    }

    #[test]
    fn keeps_code_fence_bodies_but_drops_opaque_payloads() {
        let markdown =
            "```rust\nfn resolve_anchor() {}\n```\n\n```drawing\n{\"strokes\":[[12,44]]}\n```";
        assert_eq!(index_text(markdown), "fn resolve_anchor() {}");
    }

    #[test]
    fn flattens_lists_quotes_and_tables() {
        let markdown = "> Quoted line\n\n1. First\n- Second\n\n| Name | Owner |\n| --- | --- |\n| Atlas | Ada |";
        assert_eq!(
            index_text(markdown),
            "Quoted line\nFirst\nSecond\n| Name | Owner |\n| Atlas | Ada |"
        );
    }

    #[test]
    fn leaves_punctuation_that_is_not_a_chip_sigil() {
        assert_eq!(
            index_text("Priced in US$ and written in C#."),
            "Priced in US$ and written in C#."
        );
    }

    #[test]
    fn unescapes_escaped_syntax() {
        assert_eq!(
            index_text("A literal \\#hashtag stays."),
            "A literal #hashtag stays."
        );
    }

    #[test]
    fn is_idempotent_over_already_extracted_text() {
        let once = index_text("## Heading with **bold** and [link](https://example.test)");
        assert_eq!(index_text(&once), once);
    }

    #[test]
    fn version_is_positive() {
        const { assert!(SEARCH_INDEX_VERSION > 0) };
    }
}
