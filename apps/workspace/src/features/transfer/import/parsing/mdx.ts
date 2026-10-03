import type { MarkdownTree } from "@/features/transfer/import/parsing/tree";

const MDX_FILE = /\.mdx$/i;
const FENCE_OPEN = /^\s*(`{3,}|~{3,})/;
const FENCE_ONLY = /^(`{3,}|~{3,})\s*$/;
const ESM_STATEMENT = /^(?:import|export)\s/;
// A JSX element tag occupying the whole line: `<Callout type="info">`, `</Tabs>`, `<Video src="x" />`.
const COMPONENT_TAG_LINE = /^<\/?[A-Z][\w.]*(?:\s[^<>]*)?\/?>$/;
// The first line of a JSX opening tag whose props continue on following lines.
const COMPONENT_TAG_START = /^<[A-Z][\w.]*(?:\s[^<>]*)?$/;
const INLINE_COMPONENT_TAG = /<\/?[A-Z][\w.]*(?:\s[^<>]*)?\/?>/g;
const JSX_COMMENT = /\{\/\*[\s\S]*?\*\/\}/g;
const CODE_SPAN = /(`+[^`]*`+)/;

function bracketBalance(line: string): number {
  let balance = 0;
  for (const character of line) {
    if ("{[(".includes(character)) balance += 1;
    if ("}])".includes(character)) balance -= 1;
  }
  return balance;
}

function leadingWhitespace(line: string): number {
  return line.length - line.trimStart().length;
}

function stripInlineJsx(line: string): string {
  return line
    .split(CODE_SPAN)
    .map((segment, index) =>
      index % 2 === 1
        ? segment
        : segment.replace(JSX_COMMENT, "").replace(INLINE_COMPONENT_TAG, ""),
    )
    .join("");
}

function frontmatterLength(lines: readonly string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  const closing = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
  return closing === -1 ? 0 : closing + 1;
}

/**
 * @name mdxToMarkdown
 * @description Lowers an MDX document to the Markdown the editor parses. ESM
 * `import`/`export` statements and JSX comments are dropped, JSX component tags
 * are unwrapped so their Markdown children stay, and the indentation MDX allows
 * inside components is removed so it does not turn into code blocks.
 * Frontmatter and fenced code are kept verbatim.
 *
 * @example
 * mdxToMarkdown('import { Callout } from "x"\n\n<Callout>\n  **Note**\n</Callout>\n');
 * // "\n\n**Note**\n\n"
 */
export function mdxToMarkdown(source: string): string {
  const lines = source.split(/\r?\n/);
  const header = frontmatterLength(lines);
  const output = lines.slice(0, header);
  const childIndents: (number | null)[] = [];
  let fence: string | null = null;
  let esmDepth: number | null = null;
  let tagContinues = false;

  function dedent(line: string): string {
    const depth = childIndents.length;
    if (depth === 0 || line.trim().length === 0) return line;
    const indent = childIndents[depth - 1] ?? leadingWhitespace(line);
    childIndents[depth - 1] = indent;
    return line.slice(Math.min(indent, leadingWhitespace(line)));
  }

  for (const line of lines.slice(header)) {
    const trimmed = line.trim();
    if (fence !== null) {
      output.push(dedent(line));
      if (FENCE_ONLY.test(trimmed) && trimmed.startsWith(fence)) fence = null;
      continue;
    }
    if (esmDepth !== null) {
      esmDepth += bracketBalance(line);
      if (esmDepth <= 0) esmDepth = null;
      continue;
    }
    if (tagContinues) {
      if (trimmed.endsWith(">")) {
        tagContinues = false;
        if (!trimmed.endsWith("/>")) childIndents.push(null);
        output.push("");
      }
      continue;
    }
    if (childIndents.length === 0 && ESM_STATEMENT.test(line)) {
      const balance = bracketBalance(line);
      esmDepth = balance > 0 ? balance : null;
      continue;
    }
    const fenceOpen = FENCE_OPEN.exec(line);
    if (fenceOpen?.[1]) {
      fence = fenceOpen[1];
      output.push(dedent(line));
      continue;
    }
    if (COMPONENT_TAG_LINE.test(trimmed)) {
      if (trimmed.startsWith("</")) childIndents.pop();
      else if (!trimmed.endsWith("/>")) childIndents.push(null);
      output.push("");
      continue;
    }
    if (COMPONENT_TAG_START.test(trimmed)) {
      tagContinues = true;
      continue;
    }
    output.push(dedent(stripInlineJsx(line)));
  }
  return output.join("\n");
}

/**
 * @name normalizeMdxTree
 * @description Converts every `.mdx` file in an import tree to Markdown and
 * renames it to `.md`, so every import source reads MDX like any other note.
 *
 * @example
 * const tree = normalizeMdxTree(prepared.tree);
 */
export function normalizeMdxTree(tree: MarkdownTree): MarkdownTree {
  if (!tree.files.some((file) => MDX_FILE.test(file.relativePath))) return tree;
  const taken = new Set(tree.files.map((file) => file.relativePath.toLowerCase()));
  return {
    ...tree,
    files: tree.files.map((file) => {
      if (!MDX_FILE.test(file.relativePath)) return file;
      const renamed = file.relativePath.replace(MDX_FILE, ".md");
      const relativePath = taken.has(renamed.toLowerCase())
        ? file.relativePath.replace(MDX_FILE, " (mdx).md")
        : renamed;
      taken.add(relativePath.toLowerCase());
      return { ...file, relativePath, content: mdxToMarkdown(file.content) };
    }),
  };
}
