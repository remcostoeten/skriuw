import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import {
  Decoration,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

export type RawMarkdownTokenKind =
  | "marker"
  | "heading"
  | "strong"
  | "emphasis"
  | "strike"
  | "code"
  | "fence-info"
  | "quote"
  | "link-label"
  | "link-target"
  | "reference"
  | "tag"
  | "person"
  | "task-done"
  | "html"
  | "comment";

export function rawMarkdownTokenClass(kind: RawMarkdownTokenKind): string {
  return `raw-markdown-token-${kind}`;
}

const markdownHighlight = HighlightStyle.define([
  {
    tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6],
    class: rawMarkdownTokenClass("heading"),
  },
  { tag: tags.strong, class: rawMarkdownTokenClass("strong") },
  { tag: tags.emphasis, class: rawMarkdownTokenClass("emphasis") },
  { tag: tags.strikethrough, class: rawMarkdownTokenClass("strike") },
  { tag: tags.monospace, class: rawMarkdownTokenClass("code") },
  { tag: tags.labelName, class: rawMarkdownTokenClass("fence-info") },
  { tag: tags.quote, class: rawMarkdownTokenClass("quote") },
  { tag: [tags.link, tags.string], class: rawMarkdownTokenClass("link-label") },
  { tag: tags.url, class: rawMarkdownTokenClass("link-target") },
  {
    tag: [tags.processingInstruction, tags.contentSeparator, tags.escape, tags.atom],
    class: rawMarkdownTokenClass("marker"),
  },
  { tag: tags.comment, class: rawMarkdownTokenClass("comment") },
]);

/**
 * Skriuw-specific source tokens the Markdown grammar does not know: `[[wiki
 * links]]`, `#tag` and `$person` chips, completed task markers, inline HTML,
 * and HTML comments. Matched per line, so a comment spanning lines only colors
 * its opening line.
 */
export const RAW_MARKDOWN_PRODUCT_TOKEN_PATTERN =
  /(\[\[[^\]\n]+\]\])|(?<![\p{L}\p{N}_])([#$])([\p{L}\p{N}_-]{1,64})|(<!--.*?-->)|(<\/?[a-zA-Z][^<>\n]*>)|^\s*(?:[-*+]|\d{1,9}[.)])\s+(\[[xX]\])/gu;

export function rawMarkdownProductTokenKind(
  match: RegExpExecArray,
): { kind: RawMarkdownTokenKind; from: number; to: number } | null {
  const [whole, wikiLink, chipSigil, chipName, comment, html, taskDone] = match;
  const start = match.index;
  if (wikiLink) return { kind: "reference", from: start, to: start + whole.length };
  if (chipSigil && chipName) {
    return {
      kind: chipSigil === "#" ? "tag" : "person",
      from: start,
      to: start + whole.length,
    };
  }
  if (comment) return { kind: "comment", from: start, to: start + whole.length };
  if (html) return { kind: "html", from: start, to: start + whole.length };
  if (taskDone) {
    const to = start + whole.length;
    return { kind: "task-done", from: to - taskDone.length, to };
  }
  return null;
}

const productTokenDecorator = new MatchDecorator({
  regexp: RAW_MARKDOWN_PRODUCT_TOKEN_PATTERN,
  decorate: (add, from, _to, match) => {
    const token = rawMarkdownProductTokenKind(match);
    if (!token) return;
    const offset = from - match.index;
    add(
      token.from + offset,
      token.to + offset,
      Decoration.mark({ class: rawMarkdownTokenClass(token.kind) }),
    );
  },
});

const productTokens = ViewPlugin.fromClass(
  class ProductTokenView {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = productTokenDecorator.createDeco(view);
    }

    update(update: ViewUpdate): void {
      this.decorations = productTokenDecorator.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Markdown grammar plus Skriuw's own token colors, all class-based so the theme sheet owns every color. */
export function rawMarkdownSyntax(): Extension {
  return [
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(markdownHighlight),
    productTokens,
  ];
}
