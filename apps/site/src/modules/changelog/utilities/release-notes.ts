import { Marked } from "marked";
import { escapeHtml } from "@skriuw/shared/helpers/escape-html";

const SAFE_HREF = /^(https?:|mailto:|#|\/)/i;
// A whole HTML comment, such as the one GitHub's generated release notes start with.
const HTML_COMMENT = /^\s*<!--[\s\S]*?-->\s*$/;

const marked = new Marked({ gfm: true });

marked.use({
  renderer: {
    html({ text }) {
      return HTML_COMMENT.test(text) ? "" : escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);

      if (!SAFE_HREF.test(href)) {
        return label;
      }

      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";

      return `<a href="${escapeHtml(href)}"${titleAttr}>${label}</a>`;
    },
  },
});

/**
 * @name renderReleaseNotes
 * @description Renders a GitHub release body to HTML. Raw HTML is escaped,
 * HTML comments are dropped and links are limited to http(s), mailto and
 * same-site targets.
 *
 * @example
 * <div dangerouslySetInnerHTML={{ __html: renderReleaseNotes(release.body) }} />
 */
export function renderReleaseNotes(markdown: string) {
  return marked.parse(markdown, { async: false });
}
