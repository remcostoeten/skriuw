const FENCE_OPEN = /^\s*(`{3,}|~{3,})/;
const FENCE_ONLY = /^(`{3,}|~{3,})\s*$/;
const ESM_STATEMENT = /^(?:import|export)\s/;
// A JSX element tag occupying the whole line: `<Callout type="info">`, `</Tabs>`, `<Video src="x" />`.
const COMPONENT_TAG_LINE = /^<\/?[A-Z][\w.]*(?:\s[^<>]*)?\/?>$/;
// The first line of a JSX opening tag whose props continue on following lines.
const COMPONENT_TAG_START = /^<[A-Z][\w.]*(?:\s[^<>]*)?$/;
// An inline JSX tag (`<Kbd>`, `</Kbd>`, `<Badge />`) or a `{expression}`, JSX comments included.
const INLINE_MDX = /<\/?[A-Z][\w.]*(?:\s[^<>]*)?\/?>|\{[^{}\n]*\}/g;
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

function longestBacktickRun(text: string): number {
  return Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
}

function inlineCode(text: string): string {
  const ticks = "`".repeat(longestBacktickRun(text) + 1);
  const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${ticks}${padding}${text}${padding}${ticks}`;
}

function codeInlineMdx(line: string): string {
  return line
    .split(CODE_SPAN)
    .map((segment, index) =>
      index % 2 === 1 ? segment : segment.replace(INLINE_MDX, (syntax) => inlineCode(syntax)),
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
 * @description Converts an MDX document to Markdown the editor parses without
 * losing any of it. ESM `import`/`export` statements and JSX component tags,
 * props included, become `mdx` code blocks; the Markdown children of a
 * component stay Markdown with the indentation MDX allows inside components
 * removed; inline tags and `{expressions}` become inline code. Frontmatter and
 * fenced code are kept verbatim.
 *
 * @example
 * mdxToMarkdown('<Callout type="info">\n  **Note**\n</Callout>\n');
 * // '```mdx\n<Callout type="info">\n```\n\n**Note**\n\n```mdx\n</Callout>\n```\n'
 */
export function mdxToMarkdown(source: string): string {
  const lines = source.split(/\r?\n/);
  const header = frontmatterLength(lines);
  const output = lines.slice(0, header);
  const childIndents: (number | null)[] = [];
  let mdxBlock: string[] = [];
  let needsGap = false;
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

  function flushMdxBlock(): void {
    if (mdxBlock.length === 0) return;
    const ticks = "`".repeat(Math.max(3, longestBacktickRun(mdxBlock.join("\n")) + 1));
    if (output.length > 0 && output[output.length - 1]?.trim() !== "") output.push("");
    output.push(`${ticks}mdx`, ...mdxBlock, ticks);
    mdxBlock = [];
    needsGap = true;
  }

  for (const line of lines.slice(header)) {
    const trimmed = line.trim();
    if (fence !== null) {
      output.push(dedent(line));
      if (FENCE_ONLY.test(trimmed) && trimmed.startsWith(fence)) fence = null;
      continue;
    }
    if (esmDepth !== null) {
      mdxBlock.push(line);
      esmDepth += bracketBalance(line);
      if (esmDepth <= 0) esmDepth = null;
      continue;
    }
    if (tagContinues) {
      mdxBlock.push(dedent(line));
      if (trimmed.endsWith(">")) {
        tagContinues = false;
        if (!trimmed.endsWith("/>")) childIndents.push(null);
      }
      continue;
    }
    if (childIndents.length === 0 && ESM_STATEMENT.test(line)) {
      mdxBlock.push(line);
      const balance = bracketBalance(line);
      esmDepth = balance > 0 ? balance : null;
      continue;
    }
    if (COMPONENT_TAG_LINE.test(trimmed)) {
      if (trimmed.startsWith("</")) childIndents.pop();
      mdxBlock.push(dedent(line));
      if (!trimmed.startsWith("</") && !trimmed.endsWith("/>")) childIndents.push(null);
      continue;
    }
    if (COMPONENT_TAG_START.test(trimmed)) {
      mdxBlock.push(dedent(line));
      tagContinues = true;
      continue;
    }
    flushMdxBlock();
    if (needsGap && trimmed.length > 0) output.push("");
    needsGap = false;
    const fenceOpen = FENCE_OPEN.exec(line);
    if (fenceOpen?.[1]) {
      fence = fenceOpen[1];
      output.push(dedent(line));
      continue;
    }
    output.push(dedent(codeInlineMdx(line)));
  }
  flushMdxBlock();
  return output.join("\n");
}
