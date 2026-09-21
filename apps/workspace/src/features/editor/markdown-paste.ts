import { Slice } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { parseProductMarkdownWithImages } from "./schema";
import { withFreshPastedTaskIdentities } from "./task-paste";

const MARKDOWN_BLOCK_PATTERN =
  /^ {0,3}(?:#{1,6}\s|>\s|(?:[-*+]|\d+[.)])\s+|```|~~~|(?:[-*_] *){3,}$|\|.*\|[ \t]*$)/m;

const MARKDOWN_INLINE_PATTERN =
  /\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|!?\[[^\]\n]*\]\([^()\s]+\)|\[\[[^\]\n]+\]\]/;

/**
 * Recognises Markdown syntax that is worth rendering on paste. Deliberately
 * ignores single-underscore and single-asterisk emphasis: `snake_case`
 * identifiers and `a * b` arithmetic are far more common in pasted prose than
 * the emphasis they would be mistaken for.
 */
export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_BLOCK_PATTERN.test(text) || MARKDOWN_INLINE_PATTERN.test(text);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * True when the clipboard's HTML flavour carries no structure the Markdown
 * source does not already spell out — the case for code editors and terminals,
 * which ship syntax-highlighting markup around the very same characters. HTML
 * copied from a rendered page drops the Markdown delimiters, so its text no
 * longer matches and the default HTML paste is left to handle it.
 */
export function htmlIsPlainMarkdown(html: string, text: string): boolean {
  if (html.length === 0) return true;
  if (html.includes("data-pm-slice")) return false;
  const container = window.document.createElement("div");
  container.innerHTML = html;
  return collapseWhitespace(container.textContent ?? "") === collapseWhitespace(text);
}

/**
 * Builds the slice a Markdown paste should insert, or null when the text is not
 * Markdown or lands somewhere it must stay literal. A single parsed paragraph
 * is returned with open ends so its inline content merges into the block at the
 * cursor instead of splitting it.
 */
export function markdownPasteSlice(
  state: EditorState,
  text: string,
  knownImageIds: ReadonlySet<string>,
): Slice | null {
  if (text.trim().length === 0) return null;
  if (state.selection.$from.parent.type.spec.code) return null;
  if (!looksLikeMarkdown(text)) return null;
  const parsed = parseProductMarkdownWithImages(text, knownImageIds);
  if (parsed.childCount === 0) return null;
  const onlyParagraph =
    parsed.childCount === 1 && parsed.firstChild?.type.name === "paragraph";
  if (onlyParagraph && parsed.textContent === text.trim()) return null;
  return withFreshPastedTaskIdentities(
    new Slice(parsed.content, onlyParagraph ? 1 : 0, onlyParagraph ? 1 : 0),
  );
}

export function pasteMarkdown(
  view: EditorView,
  html: string,
  text: string,
  knownImageIds: ReadonlySet<string>,
): boolean {
  if (!htmlIsPlainMarkdown(html, text)) return false;
  const slice = markdownPasteSlice(view.state, text, knownImageIds);
  if (!slice) return false;
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  return true;
}
