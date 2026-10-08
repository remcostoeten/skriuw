import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import { defaultMarkdownParser } from "prosemirror-markdown";
import { findInlineMathEnd } from "./markdown";

export type MathPasteSource = { source: string; hasMath: boolean; inline: Map<string, string> };

function closingDelimiter(source: string, start: number, delimiter: string): number {
  for (let index = start; index < source.length; index += 1) {
    if (source.startsWith(delimiter, index)) return index;
    if (source[index] === "\\") index += 1;
  }
  return -1;
}

/**
 * @name normalizePastedMath
 * @description Converts copied TeX delimiters to portable Markdown outside code and escapes.
 * @example
 * normalizePastedMath("Area \\(r^2\\)").source;
 */
export function normalizePastedMath(text: string): MathPasteSource {
  let source = "";
  let hasMath = false;
  let fence = "";
  const inlineSources = new Map<string, string>();
  let prefix = "\uE000math";
  while (text.includes(prefix)) prefix += "x";
  const protectedLines = new Set<number>();
  for (const token of defaultMarkdownParser.tokenizer.parse(text, {})) {
    if ((token.type === "fence" || token.type === "code_block") && token.map) {
      for (let line = token.map[0]; line < token.map[1]; line += 1) protectedLines.add(line);
    }
  }
  const lineNumbers = new Map<number, number>();
  let nextLine = 0;
  for (let offset = 0; offset < text.length; offset += 1) {
    if (offset === 0 || text[offset - 1] === "\n") lineNumbers.set(offset, nextLine++);
  }
  for (let index = 0; index < text.length;) {
    if (index === 0 || text[index - 1] === "\n") {
      const lineNumber = lineNumbers.get(index) ?? 0;
      const end = text.indexOf("\n", index);
      const lineEnd = end === -1 ? text.length : end + 1;
      const line = text.slice(index, lineEnd);
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (protectedLines.has(lineNumber) || fence || marker || /^(?: {4}|\t)/.test(line)) {
        source += line;
        if (fence && new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) {
          fence = "";
        } else if (!fence && marker) {
          fence = marker[1] ?? "";
        }
        index = lineEnd;
        continue;
      }
    }
    if (text[index] === "`") {
      const run = text.slice(index).match(/^`+/)?.[0] ?? "`";
      let close = text.indexOf(run, index + run.length);
      while (close !== -1 && (text[close - 1] === "`" || text[close + run.length] === "`")) {
        close = text.indexOf(run, close + run.length);
      }
      if (close !== -1) {
        source += text.slice(index, close + run.length);
        index = close + run.length;
        continue;
      }
    }
    const inline = text.startsWith("\\(", index);
    const display = text.startsWith("\\[", index) || text.startsWith("$$", index);
    if (inline || display) {
      const delimiter = inline ? "\\)" : text.startsWith("\\[", index) ? "\\]" : "$$";
      const close = closingDelimiter(text, index + 2, delimiter);
      const tex = close === -1 ? "" : text.slice(index + 2, close).trim();
      if (close !== -1 && tex && (!inline || !tex.includes("\n"))) {
        if (inline) {
          const placeholder = `${prefix}${inlineSources.size}`;
          inlineSources.set(placeholder, tex);
          source += `$${placeholder}$`;
        } else {
          source += `\n\n$$\n${tex}\n$$\n\n`;
        }
        hasMath = true;
        index = close + 2;
        if (inline && /[0-9]/.test(text[index] ?? "")) {
          source += `&#${text.charCodeAt(index)};`;
          index += 1;
        }
        continue;
      }
    }
    if (text[index] === "\\") {
      source += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (text[index] === "$") {
      const close = findInlineMathEnd(text, index);
      if (close !== -1) {
        source += text.slice(index, close + 1);
        hasMath = true;
        index = close + 1;
        continue;
      }
    }
    source += text[index];
    index += 1;
  }
  return { source, hasMath, inline: inlineSources };
}

/**
 * @name restorePastedMath
 * @description Restores copied inline TeX after parsing its protected placeholders.
 * @example
 * restorePastedMath(parsedDocument, normalized.inline);
 */
export function restorePastedMath(
  node: ProseMirrorNode,
  inline: ReadonlyMap<string, string>,
): ProseMirrorNode {
  if (inline.size === 0) return node;
  if (node.type.name === "math_inline") {
    const tex = inline.get(String(node.attrs.tex));
    return tex === undefined ? node : node.type.create({ ...node.attrs, tex }, null, node.marks);
  }
  if (node.isLeaf) return node;
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(restorePastedMath(child, inline)));
  return node.copy(Fragment.fromArray(children));
}
