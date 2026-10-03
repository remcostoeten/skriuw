import { Marked } from "marked";
import { escapeHtml } from "@skriuw/shared/helpers/escape-html";

const SAFE_HREF = /^(https?:|mailto:)/i;
// A whole HTML comment, such as Skriuw's `<!--skriuw-media:kind-->` marker.
const HTML_COMMENT = /^\s*<!--[\s\S]*?-->\s*$/;
// A `[[Note title]]` mention of another note, which the reader cannot open.
const NOTE_MENTION = /\[\[([^\]\n]+)\]\]/g;

function placeholder(label: string) {
  return `<span class="shared-note-omitted">${escapeHtml(label)}</span>`;
}

function createRenderer() {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      html({ text }) {
        return HTML_COMMENT.test(text) ? "" : escapeHtml(text);
      },
      text(token) {
        if ("tokens" in token && token.tokens) return false;
        return escapeHtml(token.text).replace(NOTE_MENTION, "$1");
      },
      link({ href, title, tokens }) {
        const label = this.parser.parseInline(tokens);
        if (!SAFE_HREF.test(href)) return label;
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${escapeHtml(href)}"${titleAttr} rel="noreferrer nofollow ugc" target="_blank">${label}</a>`;
      },
      image({ text }) {
        return placeholder(text ? `Image not included: ${text}` : "Image not included");
      },
      code({ text, lang }) {
        if (lang === "drawing") return `<p>${placeholder("Drawing not included")}</p>\n`;
        const language = lang ? ` data-language="${escapeHtml(lang)}"` : "";
        return `<pre${language}><code>${escapeHtml(text)}</code></pre>\n`;
      },
    },
  });
  return marked;
}

/**
 * Turns an owner's shared Markdown into HTML for skriuw.com. Shared notes are
 * untrusted input on a first-party origin, so raw HTML is escaped, links are
 * limited to http(s) and mailto, and local images and drawings become
 * placeholders instead of references the reader cannot load.
 */
export function renderSharedMarkdown(markdown: string): string {
  return createRenderer().parse(markdown, { async: false });
}
