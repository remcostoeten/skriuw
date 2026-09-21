import { readFile } from "node:fs/promises";
import path from "node:path";
import { Marked } from "marked";
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

const repoRoot = path.resolve(process.cwd(), "..");

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

function createRenderer(sourceDir: string, headings: DocHeading[]) {
  const marked = new Marked({ gfm: true });
  const used = new Map<string, number>();

  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const text = stripTags(html);
        const base = slugify(text);
        const seen = used.get(base) ?? 0;
        const id = seen === 0 ? base : `${base}-${seen + 1}`;

        used.set(base, seen + 1);

        if (depth === 2 || depth === 3) {
          headings.push({ id, text, depth });
        }

        return `<h${depth} id="${id}"><a class="doc-anchor" href="#${id}">${html}</a></h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const resolved = resolveDocHref(href, sourceDir);
        const label = this.parser.parseInline(tokens);
        const titleAttr = title ? ` title="${title}"` : "";
        const external = /^https?:/.test(resolved)
          ? ' target="_blank" rel="noreferrer"'
          : "";

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
  const absolute = path.join(repoRoot, page.source);
  const source = await readFile(absolute, "utf8");
  const { lede, body } = splitLede(source);
  const headings: DocHeading[] = [];
  const marked = createRenderer(path.posix.dirname(page.source), headings);
  const html = await marked.parse(body);

  return { html, headings, lede };
}
