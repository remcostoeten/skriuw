import { readFile } from "node:fs/promises";
import path from "node:path";
import { Marked, type Tokens } from "marked";
import { docPages, docBranch, type DocPage } from "@/data/docs";
import { repoUrl } from "@/data/content";

export type DocHeading = {
  id: string;
  text: string;
  depth: 2 | 3;
};

export type RenderedDoc = {
  html: string;
  headings: DocHeading[];
  lede: string;
};

const docReaders: Record<string, () => Promise<string>> = {
  "docs/FEATURES.md": () => readFile(path.join(process.cwd(), "../../docs/FEATURES.md"), "utf8"),
  "docs/ARCHITECTURE.md": () =>
    readFile(path.join(process.cwd(), "../../docs/ARCHITECTURE.md"), "utf8"),
  "docs/performance-contract.md": () =>
    readFile(path.join(process.cwd(), "../../docs/performance-contract.md"), "utf8"),
  "CHANGELOG.md": () => readFile(path.join(process.cwd(), "../../CHANGELOG.md"), "utf8"),
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "").trim();
}

function resolveDocHref(href: string, sourceDir: string) {
  if (/^(https?:|mailto:|#)/.test(href)) {
    return href;
  }

  const [target, hash] = href.split("#");
  const repoPath = path.posix.normalize(path.posix.join(sourceDir, target));
  const internal = docPages.find((page) => page.source === repoPath);

  if (internal) {
    return hash ? `/docs/${internal.slug}/#${hash}` : `/docs/${internal.slug}/`;
  }

  const kind = repoPath.endsWith(".md") ? "blob" : "tree";
  const suffix = hash ? `#${hash}` : "";

  return `${repoUrl}/${kind}/${docBranch}/${repoPath}${suffix}`;
}

function findLabel(item: Tokens.ListItem) {
  const lead = item.tokens[0];
  const inline = lead?.type === "text" || lead?.type === "paragraph" ? lead.tokens : undefined;
  const [label, rest] = inline ?? [];

  if (label?.type !== "strong" || rest?.type !== "text" || !rest.raw.startsWith(":")) {
    return undefined;
  }

  return label as Tokens.Strong;
}

function createRenderer(sourceDir: string, headings: DocHeading[], outlineLabels: boolean) {
  const marked = new Marked({ gfm: true });
  const used = new Map<string, number>();

  function uniqueId(text: string) {
    const base = slugify(text);
    const seen = used.get(base) ?? 0;

    used.set(base, seen + 1);

    return seen === 0 ? base : `${base}-${seen + 1}`;
  }

  marked.use({
    renderer: {
      /**
       * Renders one markdown heading as an anchored `<hN>` element.
       *
       * The id is slugified from the visible text; a heading repeated on the
       * same page gets a `-2`, `-3`, … suffix so anchors stay unique. Depth 2
       * and 3 headings are also recorded in `headings` for the page's table
       * of contents.
       *
       * @param token - The heading token, destructured.
       * @param token.tokens - Inline tokens for the heading text, rendered through the parser's inline pass.
       * @param token.depth - Heading level from the source markdown, 1–6.
       * @returns The heading markup wrapped in its permalink anchor, newline-terminated.
       */
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const text = stripTags(html);
        const id = uniqueId(text);

        if (depth === 2 || depth === 3) {
          headings.push({ id, text, depth });
        }

        return `<h${depth} id="${id}"><a class="doc-anchor" href="#${id}">${html}</a></h${depth}>\n`;
      },
      /**
       * Renders a list item whose text opens with a `**Label**:` as an anchored
       * `<li>` and records the label as a depth 3 outline entry, when the page
       * opts in with `outlineLabels`. Every other item falls back to marked's
       * default rendering.
       *
       * @param item - The list item token.
       * @returns The anchored item markup, or `false` to use the default renderer.
       */
      listitem(item) {
        const label = outlineLabels ? findLabel(item) : undefined;

        if (!label) {
          return false;
        }

        const text = stripTags(this.parser.parseInline(label.tokens));
        const id = uniqueId(text);

        headings.push({ id, text, depth: 3 });

        return `<li id="${id}">${this.parser.parse(item.tokens)}</li>\n`;
      },
      link({ href, title, tokens }) {
        const resolved = resolveDocHref(href, sourceDir);
        const label = this.parser.parseInline(tokens);
        const titleAttr = title ? ` title="${title}"` : "";
        const external = /^https?:/.test(resolved) ? ' target="_blank" rel="noreferrer"' : "";

        return `<a href="${resolved}"${titleAttr}${external}>${label}</a>`;
      },
    },
  });

  return marked;
}

function splitLede(source: string) {
  const withoutTitle = source.replace(/^#\s+.*(\r?\n)+/, "");
  const match = withoutTitle.match(/^([^\n#|>-].*)(\r?\n){2}/);

  if (!match) {
    return { lede: "", body: withoutTitle };
  }

  return {
    lede: stripTags(match[1]).replace(/\*\*/g, ""),
    body: withoutTitle.slice(match[0].length),
  };
}

export async function renderDoc(page: DocPage): Promise<RenderedDoc> {
  "use cache";
  const read = docReaders[page.source];
  if (!read) throw new Error(`No docs reader registered for ${page.source}`);
  const source = await read();
  const { lede, body } = splitLede(source);
  const headings: DocHeading[] = [];
  const marked = createRenderer(
    path.posix.dirname(page.source),
    headings,
    page.outlineLabels ?? false,
  );
  const html = await marked.parse(body);

  return { html, headings, lede };
}
