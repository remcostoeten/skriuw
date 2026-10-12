import { Marked } from "marked";
import { escapeHtml } from "@skriuw/shared/helpers/escape-html";
import { createHeadingIds, headingText, type DocHeading } from "@/modules/docs/heading-ids";

export type RenderedSharedNote = {
  html: string;
  headings: DocHeading[];
};

const SAFE_HREF = /^(https?:|mailto:)/i;
// A whole HTML comment, such as Skriuw's `<!--skriuw-media:kind-->` marker.
const HTML_COMMENT = /^\s*<!--[\s\S]*?-->\s*$/;
// A `[[Note title]]` mention of another note, which the reader cannot open.
const NOTE_MENTION = /\[\[([^\]\n]+)\]\]/g;
const LOCAL_IMAGE_PREFIX = "images/";

function placeholder(label: string) {
  return `<span class="shared-note-omitted">${escapeHtml(label)}</span>`;
}

function sameText(left: string, right: string) {
  return left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}

function createRenderer(
  headings: DocHeading[],
  title: string,
  images: ReadonlyMap<string, string>,
) {
  const marked = new Marked({ gfm: true });
  const nextId = createHeadingIds();
  marked.use({
    hooks: {
      processAllTokens(tokens) {
        const first = tokens.findIndex((token) => token.type !== "space");
        const lead = tokens[first];
        if (title && lead?.type === "heading" && lead.depth === 1 && sameText(lead.text, title)) {
          tokens.splice(first, 1);
        }
        return tokens;
      },
    },
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const text = headingText(html);
        const id = nextId(text);
        if (depth === 2 || depth === 3) headings.push({ id, text, depth });
        const body = html.includes("<a ")
          ? html
          : `<a class="doc-anchor" href="#${id}">${html}</a>`;
        return `<h${depth} id="${id}">${body}</h${depth}>\n`;
      },
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
 * @name renderSharedNote
 * @description Turns an owner's shared Markdown into HTML for skriuw.com plus
 * the h2 and h3 outline for its table of contents. Shared notes are untrusted
 * input on a first-party origin, so raw HTML is escaped, links are limited to
 * http(s) and mailto, and drawings and any local image missing from `images`
 * (image id to published URL) become placeholders.
 * Headings get unique slug ids, and a leading `# Title` equal to the note
 * title is dropped because the page already shows it.
 *
 * @example
 * const { html, headings } = renderSharedNote(markdown, note.title, imageUrls);
 */
export function renderSharedNote(
  markdown: string,
  title = "",
  images: ReadonlyMap<string, string> = new Map(),
): RenderedSharedNote {
  const headings: DocHeading[] = [];
  const html = createRenderer(headings, title, images).parse(markdown, { async: false });
  return { html, headings };
}

/**
 * @name renderSharedMarkdown
 * @description Renders shared Markdown to HTML only, keeping every heading.
 *
 * @example
 * const html = renderSharedMarkdown("# Trip\n\nBook the train");
 */
export function renderSharedMarkdown(
  markdown: string,
  images: ReadonlyMap<string, string> = new Map(),
): string {
  return renderSharedNote(markdown, "", images).html;
}

/**
 * @name showsOutline
 * @description Decides whether a shared note gets a table of contents: only
 * notes with at least three h2 or h3 headings are long enough to need one.
 *
 * @example
 * if (showsOutline(note.headings)) renderOutline(note.headings);
 */
export function showsOutline(headings: DocHeading[]): boolean {
  return headings.length >= 3;
}
