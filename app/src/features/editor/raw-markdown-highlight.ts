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
  | "property"
  | "html"
  | "comment";

export type RawMarkdownToken = {
  text: string;
  kind: RawMarkdownTokenKind | null;
};

export type RawMarkdownHighlight = readonly (readonly RawMarkdownToken[])[];

/**
 * Emphasis can wrap a link that wraps inline code; past a few levels the extra
 * passes stop changing what a reader sees, so the remainder keeps the outer
 * kind rather than recursing further.
 */
const MAX_NESTING = 4;

const COMMENT = /<!--[\s\S]*?-->/y;
const AUTOLINK = /<((?:https?|mailto):[^>\s]+)>/y;
const HTML_TAG = /<\/?[a-zA-Z][^<>]*>/y;
const INLINE_CODE = /(`+)([^\n]*?)\1(?!`)/y;
const WIKI_LINK = /\[\[([^\]\n]+)\]\]/y;
const LINK = /\[([^\]\n]*)\]\(([^)\n]*)\)/y;
const IMAGE = /!\[([^\]\n]*)\]\(([^)\n]*)\)/y;
const STRONG_STAR = /\*\*(?=\S)([^\n]*?\S)\*\*/y;
const STRONG_UNDERSCORE = /__(?=\S)([^\n]*?\S)__/y;
const EMPHASIS_STAR = /\*(?=\S)([^*\n]*?\S)\*/y;
const EMPHASIS_UNDERSCORE = /_(?=\S)([^_\n]*?\S)_/y;
const STRIKE = /~~(?=\S)([^\n]*?\S)~~/y;
const CHIP = /([#$])([\p{L}\p{N}_-]{1,64})/yu;
const BARE_URL = /https?:\/\/[^\s<>()[\]]+/y;

const FENCE_LINE = /^(\s*)(```+|~~~+)(.*)$/;
const FRONT_MATTER_EDGE = /^(?:---|\.\.\.)\s*$/;
const FRONT_MATTER_ENTRY = /^(\s*)([\w][\w .-]*)(:)(.*)$/;
const HEADING_LINE = /^(\s*)(#{1,6})(\s+)(.*)$/;
const QUOTE_LINE = /^(\s*)((?:>\s?)+)(.*)$/;
const THEMATIC_BREAK = /^\s*(?:\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)[\s*\-_]*$/;
const LIST_LINE = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/;
const TABLE_LINE = /^\s*\|/;
const TABLE_DELIMITER_LINE = /^[\s|:-]+$/;

/** Characters that can begin an inline construct, so plain runs skip matching. */
const INLINE_OPENERS = new Set(["\\", "<", "`", "[", "!", "*", "_", "~", "#", "$", "h"]);

const WORD_CHARACTER = /[\p{L}\p{N}]/u;
const CHIP_BOUNDARY = /[\s([{]/;

function marker(text: string): RawMarkdownToken {
  return { text, kind: "marker" };
}

function token(text: string, kind: RawMarkdownTokenKind): RawMarkdownToken {
  return { text, kind };
}

function sticky(pattern: RegExp, source: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(source);
}

/** Capture group text, with an unmatched optional group reading as empty. */
function group(match: RegExpExecArray, index: number): string {
  return match[index] ?? "";
}

function plainToken(text: string): RawMarkdownToken[] {
  return text.length > 0 ? [{ text, kind: null }] : [];
}

/**
 * Scans `text` as inline Markdown, then paints anything that came back
 * unclassified with the enclosing construct's kind, so `**bold `code`**` keeps
 * the code span teal while the surrounding words read as bold.
 */
function nested(text: string, kind: RawMarkdownTokenKind, depth: number): RawMarkdownToken[] {
  if (text.length === 0) {
    return [];
  }
  if (depth >= MAX_NESTING) {
    return [token(text, kind)];
  }
  return scanInline(text, depth + 1).map((inner) =>
    inner.kind === null ? token(inner.text, kind) : inner,
  );
}

type InlineMatch = {
  tokens: RawMarkdownToken[];
  length: number;
};

function matchInline(source: string, at: number, depth: number): InlineMatch | null {
  const head = source[at];

  if (head === "\\" && at + 1 < source.length) {
    return { tokens: [marker(source.slice(at, at + 2))], length: 2 };
  }

  if (head === "<") {
    const comment = sticky(COMMENT, source, at);
    if (comment) {
      return { tokens: [token(comment[0], "comment")], length: comment[0].length };
    }
    const autolink = sticky(AUTOLINK, source, at);
    if (autolink) {
      return {
        tokens: [marker("<"), token(group(autolink, 1), "link-target"), marker(">")],
        length: autolink[0].length,
      };
    }
    const html = sticky(HTML_TAG, source, at);
    return html ? { tokens: [token(html[0], "html")], length: html[0].length } : null;
  }

  if (head === "`") {
    const code = sticky(INLINE_CODE, source, at);
    return code
      ? {
          tokens: [marker(group(code, 1)), token(group(code, 2), "code"), marker(group(code, 1))],
          length: code[0].length,
        }
      : null;
  }

  if (head === "[") {
    const wiki = sticky(WIKI_LINK, source, at);
    if (wiki) {
      return {
        tokens: [marker("[["), token(group(wiki, 1), "reference"), marker("]]")],
        length: wiki[0].length,
      };
    }
    const link = sticky(LINK, source, at);
    return link
      ? {
          tokens: [
            marker("["),
            ...nested(group(link, 1), "link-label", depth),
            marker("]("),
            token(group(link, 2), "link-target"),
            marker(")"),
          ],
          length: link[0].length,
        }
      : null;
  }

  if (head === "!") {
    const image = sticky(IMAGE, source, at);
    return image
      ? {
          tokens: [
            marker("!["),
            token(group(image, 1), "link-label"),
            marker("]("),
            token(group(image, 2), "link-target"),
            marker(")"),
          ],
          length: image[0].length,
        }
      : null;
  }

  if (head === "~") {
    const strike = sticky(STRIKE, source, at);
    return strike
      ? {
          tokens: [marker("~~"), ...nested(group(strike, 1), "strike", depth), marker("~~")],
          length: strike[0].length,
        }
      : null;
  }

  if (head === "*" || head === "_") {
    // `snake_case` is one word, not emphasis, so underscores only open a span
    // at a word boundary.
    const intraWord =
      head === "_" && at > 0 && WORD_CHARACTER.test(source[at - 1] ?? "");
    if (intraWord) {
      return null;
    }
    const strong = sticky(head === "*" ? STRONG_STAR : STRONG_UNDERSCORE, source, at);
    if (strong) {
      const fence = head === "*" ? "**" : "__";
      return {
        tokens: [marker(fence), ...nested(group(strong, 1), "strong", depth), marker(fence)],
        length: strong[0].length,
      };
    }
    const emphasis = sticky(head === "*" ? EMPHASIS_STAR : EMPHASIS_UNDERSCORE, source, at);
    return emphasis
      ? {
          tokens: [marker(head), ...nested(group(emphasis, 1), "emphasis", depth), marker(head)],
          length: emphasis[0].length,
        }
      : null;
  }

  if (head === "#" || head === "$") {
    if (at > 0 && !CHIP_BOUNDARY.test(source[at - 1] ?? "")) {
      return null;
    }
    const chip = sticky(CHIP, source, at);
    return chip
      ? {
          tokens: [token(chip[0], group(chip, 1) === "#" ? "tag" : "person")],
          length: chip[0].length,
        }
      : null;
  }

  if (head === "h") {
    if (at > 0 && WORD_CHARACTER.test(source[at - 1] ?? "")) {
      return null;
    }
    const url = sticky(BARE_URL, source, at);
    return url ? { tokens: [token(url[0], "link-target")], length: url[0].length } : null;
  }

  return null;
}

function scanInline(source: string, depth = 0): RawMarkdownToken[] {
  const tokens: RawMarkdownToken[] = [];
  let plain = "";
  let index = 0;

  function flush(): void {
    if (plain.length > 0) {
      tokens.push({ text: plain, kind: null });
      plain = "";
    }
  }

  while (index < source.length) {
    const head = source[index] ?? "";
    const match = INLINE_OPENERS.has(head) ? matchInline(source, index, depth) : null;
    if (match === null) {
      plain += head;
      index += 1;
      continue;
    }
    flush();
    tokens.push(...match.tokens);
    index += match.length;
  }

  flush();
  return tokens;
}

function scanTableRow(line: string): RawMarkdownToken[] {
  if (TABLE_DELIMITER_LINE.test(line)) {
    return [marker(line)];
  }
  const tokens: RawMarkdownToken[] = [];
  let cell = "";
  for (const character of line) {
    if (character === "|") {
      tokens.push(...scanInline(cell));
      cell = "";
      tokens.push(marker("|"));
      continue;
    }
    cell += character;
  }
  tokens.push(...scanInline(cell));
  return tokens;
}

function scanFrontMatterEntry(line: string): RawMarkdownToken[] {
  const entry = FRONT_MATTER_ENTRY.exec(line);
  if (entry === null) {
    return [token(line, "property")];
  }
  return [
    ...plainToken(group(entry, 1)),
    token(group(entry, 2), "property"),
    marker(group(entry, 3)),
    ...plainToken(group(entry, 4)),
  ];
}

function scanBlockLine(line: string): RawMarkdownToken[] {
  if (line.length === 0) {
    return [];
  }

  const heading = HEADING_LINE.exec(line);
  if (heading) {
    return [
      ...plainToken(group(heading, 1)),
      marker(group(heading, 2) + group(heading, 3)),
      ...nested(group(heading, 4), "heading", 0),
    ];
  }

  if (THEMATIC_BREAK.test(line)) {
    return [marker(line)];
  }

  const quote = QUOTE_LINE.exec(line);
  if (quote) {
    return [
      ...plainToken(group(quote, 1)),
      marker(group(quote, 2)),
      ...nested(group(quote, 3), "quote", 0),
    ];
  }

  const list = LIST_LINE.exec(line);
  if (list) {
    const checkbox = group(list, 4);
    const box =
      checkbox.length === 0
        ? []
        : [
            checkbox.trimEnd().toLowerCase() === "[x]"
              ? token(checkbox, "task-done")
              : marker(checkbox),
          ];
    return [
      ...plainToken(group(list, 1)),
      marker(group(list, 2) + group(list, 3)),
      ...box,
      ...scanInline(group(list, 5)),
    ];
  }

  if (TABLE_LINE.test(line)) {
    return scanTableRow(line);
  }

  return scanInline(line);
}

/**
 * Tokenises Markdown source one line at a time. Raw Markdown renders with
 * `wrap="off"`, so a line of source is always a single rendered row and the
 * highlight overlay can be laid out row for row against the textarea.
 */
export function highlightRawMarkdown(markdown: string): RawMarkdownHighlight {
  const lines = markdown.split("\n");
  const highlighted: RawMarkdownToken[][] = [];
  let openFence: string | null = null;
  let inFrontMatter = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (openFence !== null) {
      if (line.trimStart().startsWith(openFence)) {
        openFence = null;
        highlighted.push([marker(line)]);
      } else {
        highlighted.push(line.length === 0 ? [] : [token(line, "code")]);
      }
      continue;
    }

    if (inFrontMatter) {
      if (FRONT_MATTER_EDGE.test(line)) {
        inFrontMatter = false;
        highlighted.push([marker(line)]);
      } else {
        highlighted.push(scanFrontMatterEntry(line));
      }
      continue;
    }

    if (index === 0 && FRONT_MATTER_EDGE.test(line)) {
      inFrontMatter = true;
      highlighted.push([marker(line)]);
      continue;
    }

    const fence = FENCE_LINE.exec(line);
    if (fence) {
      const ticks = group(fence, 2);
      const info = group(fence, 3);
      openFence = ticks;
      highlighted.push([
        ...plainToken(group(fence, 1)),
        marker(ticks),
        ...(info.length > 0 ? [token(info, "fence-info")] : []),
      ]);
      continue;
    }

    highlighted.push(scanBlockLine(line));
  }

  return highlighted;
}
