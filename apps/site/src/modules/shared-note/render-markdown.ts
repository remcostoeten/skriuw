import { Marked } from "marked";
import { escapeHtml } from "@skriuw/shared/helpers/escape-html";

const SAFE_HREF = /^(https?:|mailto:)/i;
// A whole HTML comment, such as Skriuw's `<!--skriuw-media:kind-->` marker.
const HTML_COMMENT = /^\s*<!--[\s\S]*?-->\s*$/;
// A `[[Note title]]` mention of another note, which the reader cannot open.
const NOTE_MENTION = /\[\[([^\]\n]+)\]\]/g;
const LOCAL_IMAGE_PREFIX = "images/";

function placeholder(label: string) {
  return `<span class="shared-note-omitted">${escapeHtml(label)}</span>`;
}

function createRenderer(images: ReadonlyMap<string, string>) {
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
      image({ href, text }) {
        const source = href.startsWith(LOCAL_IMAGE_PREFIX)
          ? images.get(href.slice(LOCAL_IMAGE_PREFIX.length))
          : undefined;
        if (!source) {
          return placeholder(text ? `Image not included: ${text}` : "Image not included");
        }
        return `<img src="${escapeHtml(source)}" alt="${escapeHtml(text)}" loading="lazy" decoding="async">`;
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
 * limited to http(s) and mailto, and drawings and any local image missing
 * from `images` (image id to published URL) become placeholders instead of
 * references the reader cannot load.
 */
export function renderSharedMarkdown(
  markdown: string,
  images: ReadonlyMap<string, string> = new Map(),
): string {
  return createRenderer(images).parse(markdown, { async: false });
}
