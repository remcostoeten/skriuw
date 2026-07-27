const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? whole : String.fromCodePoint(code);
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? whole : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export type EnmlConversion = {
  markdown: string;
  mediaCount: number;
  encryptedCount: number;
};

type ListFrame = {
  ordered: boolean;
  index: number;
};

type TagToken = {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attributes: string;
};

function parseTagToken(raw: string): TagToken | null {
  const match = /^<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>$/.exec(raw);
  if (!match) {
    return null;
  }
  return {
    name: (match[2] ?? "").toLowerCase(),
    closing: match[1] === "/",
    selfClosing: match[4] === "/",
    attributes: match[3] ?? "",
  };
}

function attributeValue(attributes: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(
    attributes,
  );
  return match ? (match[2] ?? match[3] ?? "") : null;
}

const HEADING_LEVELS: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

const INLINE_MARKERS: Record<string, string> = {
  b: "**",
  strong: "**",
  i: "*",
  em: "*",
  s: "~~",
  strike: "~~",
  del: "~~",
  code: "`",
  tt: "`",
};

/**
 * Converts an ENML (Evernote note markup) body to Markdown without a DOM.
 * Handles block structure (divs as lines, headings, lists, tables, code
 * blocks), the common inline marks, links, checkboxes, and horizontal rules.
 * `en-media` attachments and `en-crypt` blocks are counted for warnings and
 * replaced by short placeholders.
 */
export function enmlToMarkdown(enml: string): EnmlConversion {
  const bodyMatch = /<en-note[^>]*>([\s\S]*?)<\/en-note>/i.exec(enml);
  const body = bodyMatch?.[1] ?? enml;
  const lines: string[] = [];
  let line = "";
  let lineHasContent = false;
  const listStack: ListFrame[] = [];
  const markStack: Array<{ name: string; marker: string; position: number }> = [];
  let linkHref: string | null = null;
  let linkStart = 0;
  let headingLevel = 0;
  let mediaCount = 0;
  let encryptedCount = 0;
  let codeBlockDepth = 0;
  let codeLines: string[] = [];
  let codeLine = "";
  let tableRows: string[][] = [];
  let tableCell = "";
  let inTable = false;
  let inCell = false;
  let preDepth = 0;

  function flushLine(): void {
    if (lineHasContent) {
      lines.push(line.replace(/[ \t]+$/, ""));
    } else if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    line = "";
    lineHasContent = false;
  }

  function append(text: string): void {
    if (text.length === 0) {
      return;
    }
    if (inCell) {
      tableCell += text;
      return;
    }
    if (codeBlockDepth > 0 || preDepth > 0) {
      codeLine += text;
      return;
    }
    line += text;
    lineHasContent = lineHasContent || text.trim().length > 0;
  }

  function openLine(prefix: string): void {
    flushLine();
    line = prefix;
    lineHasContent = prefix.trim().length > 0;
  }

  function listPrefix(): string {
    const depth = Math.max(listStack.length - 1, 0);
    const frame = listStack[listStack.length - 1];
    const bullet = frame?.ordered ? `${(frame.index += 1)}.` : "-";
    return `${"  ".repeat(depth)}${bullet} `;
  }

  function flushCodeLine(): void {
    codeLines.push(codeLine);
    codeLine = "";
  }

  function emitCodeBlock(): void {
    if (codeLine.length > 0) {
      flushCodeLine();
    }
    flushLine();
    lines.push("```", ...codeLines, "```");
    codeLines = [];
    codeLine = "";
  }

  function emitTable(): void {
    flushLine();
    const width = Math.max(...tableRows.map((row) => row.length), 1);
    const pad = (row: string[]): string[] => [
      ...row,
      ...Array(width - row.length).fill(""),
    ];
    const render = (row: string[]): string =>
      `| ${pad(row)
        .map((cell) => cell.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim())
        .join(" | ")} |`;
    const [header = [], ...rest] = tableRows;
    lines.push(render(header));
    lines.push(`| ${Array(width).fill("---").join(" | ")} |`);
    for (const row of rest) {
      lines.push(render(row));
    }
    tableRows = [];
  }

  const tokens = body.match(/<[^>]+>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (!token.startsWith("<")) {
      const decoded = decodeXmlEntities(token);
      if (preDepth > 0 || codeBlockDepth > 0) {
        const parts = decoded.split("\n");
        for (const [index, part] of parts.entries()) {
          if (index > 0) {
            flushCodeLine();
          }
          codeLine += part;
        }
      } else {
        append(decoded.replace(/\s+/g, " "));
      }
      continue;
    }
    if (token.startsWith("<!--") || token.startsWith("<!") || token.startsWith("<?")) {
      continue;
    }
    const tag = parseTagToken(token);
    if (!tag) {
      continue;
    }
    const { name, closing, selfClosing, attributes } = tag;
    if (name === "en-media") {
      if (!closing) {
        mediaCount += 1;
        append("(attachment)");
      }
      continue;
    }
    if (name === "en-crypt") {
      if (!closing) {
        encryptedCount += 1;
        append("(encrypted content)");
      }
      continue;
    }
    if (name === "en-todo") {
      if (!closing) {
        const checked = attributeValue(attributes, "checked") === "true";
        append(checked ? "[x] " : "[ ] ");
      }
      continue;
    }
    if (name === "pre") {
      if (closing) {
        preDepth = Math.max(preDepth - 1, 0);
        if (preDepth === 0) {
          emitCodeBlock();
        }
      } else {
        preDepth += 1;
      }
      continue;
    }
    if (codeBlockDepth > 0) {
      if (name === "div") {
        if (closing) {
          codeBlockDepth -= 1;
          if (codeBlockDepth === 0) {
            emitCodeBlock();
          } else {
            flushCodeLine();
          }
        } else if (!selfClosing) {
          codeBlockDepth += 1;
        }
      } else if (name === "br") {
        flushCodeLine();
      }
      continue;
    }
    switch (name) {
      case "div": {
        const style = attributeValue(attributes, "style") ?? "";
        if (!closing && /en-codeblock\s*:\s*true/i.test(style)) {
          codeBlockDepth = 1;
          continue;
        }
        flushLine();
        break;
      }
      case "p":
      case "br":
        flushLine();
        break;
      case "hr":
        flushLine();
        lines.push("---");
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        if (closing) {
          flushLine();
          headingLevel = 0;
        } else {
          headingLevel = HEADING_LEVELS[name] ?? 1;
          openLine(`${"#".repeat(headingLevel)} `);
        }
        break;
      case "ul":
      case "ol":
        if (closing) {
          listStack.pop();
          if (listStack.length === 0) {
            flushLine();
          }
        } else {
          listStack.push({ ordered: name === "ol", index: 0 });
        }
        break;
      case "li":
        if (!closing) {
          openLine(listPrefix());
        }
        break;
      case "blockquote":
        if (!closing) {
          openLine("> ");
        } else {
          flushLine();
        }
        break;
      case "table":
        if (closing) {
          inTable = false;
          emitTable();
        } else {
          inTable = true;
          tableRows = [];
        }
        break;
      case "tr":
        if (inTable && !closing) {
          tableRows.push([]);
        }
        break;
      case "td":
      case "th":
        if (!inTable) {
          break;
        }
        if (closing) {
          tableRows[tableRows.length - 1]?.push(tableCell);
          tableCell = "";
          inCell = false;
        } else {
          inCell = true;
          tableCell = "";
        }
        break;
      case "a":
        if (closing) {
          if (linkHref !== null) {
            const target = inCell ? tableCell : line;
            const text = target.slice(linkStart).trim();
            const replacement =
              text.length > 0 ? `[${text}](${linkHref})` : `<${linkHref}>`;
            if (inCell) {
              tableCell = tableCell.slice(0, linkStart) + replacement;
            } else {
              line = line.slice(0, linkStart) + replacement;
              lineHasContent = true;
            }
            linkHref = null;
          }
        } else {
          const href = attributeValue(attributes, "href");
          if (href !== null && href.length > 0) {
            linkHref = decodeXmlEntities(href);
            linkStart = inCell ? tableCell.length : line.length;
          }
        }
        break;
      default: {
        const marker = INLINE_MARKERS[name];
        if (marker === undefined) {
          break;
        }
        if (closing) {
          const open = markStack.pop();
          if (open?.name === name) {
            const target = inCell ? tableCell : line;
            const before = target.slice(0, open.position - marker.length);
            const inner = target.slice(open.position);
            const core = inner.trim();
            const leading = /^\s*/.exec(inner)?.[0] ?? "";
            const trailing = core.length > 0 ? (/\s*$/.exec(inner)?.[0] ?? "") : "";
            const filler =
              inner.length > 0 && !/\s$/.test(before) && before.length > 0 ? " " : "";
            const rebuilt =
              core.length > 0
                ? `${before}${leading}${marker}${core}${marker}${trailing}`
                : `${before}${filler}`;
            if (inCell) {
              tableCell = rebuilt;
            } else {
              line = rebuilt;
              lineHasContent = rebuilt.trim().length > 0;
            }
          }
        } else if (!selfClosing) {
          append(marker);
          markStack.push({
            name,
            marker,
            position: inCell ? tableCell.length : line.length,
          });
        }
        break;
      }
    }
  }
  flushLine();
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  while (lines.length > 0 && lines[0] === "") {
    lines.shift();
  }
  return { markdown: lines.join("\n"), mediaCount, encryptedCount };
}
