import { isBareDomain, trimUrlPunctuation } from "@skriuw/shared/helpers/bare-domain";
import { InputRule } from "prosemirror-inputrules";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { productSchema } from "./product-schema";

export function linkInputRule(): InputRule {
  return new InputRule(/\[([^[\]]+)\]\(([^()\s]+)\)$/, (state, match, start, end) => {
    const link = productSchema.marks.link;
    const text = match[1] ?? "";
    const href = match[2] ?? "";
    if (!link || !text || !href) return null;
    if (state.doc.resolve(start).parent.type.spec.code) return null;
    const codeMark = productSchema.marks.code;
    if (codeMark && state.doc.rangeHasMark(start, end, codeMark)) return null;
    const tr = state.tr.delete(start, end).insertText(text, start);
    tr.addMark(start, start + text.length, link.create({ href }));
    tr.removeStoredMark(link);
    return tr;
  });
}

// The last word before the typed whitespace, without the parentheses that open it.
const AUTOLINK_PATTERN = /(?:^|[\s(])\(*([^\s<>(][^\s<>]*)(\s)$/;
const SCHEME_URL = /^https?:\/\//i;
const PASTED_URL_PATTERN = /^(?:https?:\/\/|www\.)[^\s<>]+$/;

function autolinkTarget(word: string): string | null {
  const url = trimUrlPunctuation(word);
  if (SCHEME_URL.test(url)) return url.replace(SCHEME_URL, "") ? url : null;
  return isBareDomain(url) ? url : null;
}

/**
 * Links a URL or bare domain once the word is closed by whitespace. Input
 * rules run before the trigger character reaches the document, so the
 * whitespace has to be re-inserted here or typing it would be swallowed.
 */
export function autolinkInputRule(): InputRule {
  return new InputRule(AUTOLINK_PATTERN, (state, match, start, end) => {
    const link = productSchema.marks.link;
    const word = match[1] ?? "";
    const trailing = match[2] ?? "";
    const url = autolinkTarget(word);
    if (!link || !url) return null;
    const from = start + match[0].indexOf(word);
    const to = from + url.length;
    if (state.doc.rangeHasMark(from, to, link)) return null;
    const codeMark = productSchema.marks.code;
    if (codeMark && state.doc.rangeHasMark(from, to, codeMark)) return null;
    const tr = state.tr.addMark(from, to, link.create({ href: normalizeAutolink(url) }));
    tr.removeStoredMark(link);
    tr.insertText(trailing, end);
    tr.removeMark(end, end + trailing.length, link);
    return tr;
  });
}

export function normalizeAutolink(url: string): string {
  return SCHEME_URL.test(url) ? url : `https://${url}`;
}

/**
 * Links the selected text when the pasted clipboard content is a bare URL or
 * domain, rather than replacing the selection with it. Returns false when the
 * paste should fall through to the default handling.
 */
export function linkPastedText(view: EditorView, text: string): boolean {
  const link = productSchema.marks.link;
  const { selection } = view.state;
  const trimmed = text.trim();
  if (!link || selection.empty || !(selection instanceof TextSelection)) return false;
  if (!PASTED_URL_PATTERN.test(trimmed) && !isBareDomain(trimmed)) return false;
  if (selection.$from.parent.type.spec.code) return false;
  view.dispatch(
    view.state.tr
      .addMark(selection.from, selection.to, link.create({ href: normalizeAutolink(trimmed) }))
      .removeStoredMark(link),
  );
  return true;
}
