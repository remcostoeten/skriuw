import type { Block, PartialBlock } from "@blocknote/core";
import type { RichTextDocument } from "@/types/notes";

const WIKI_LINK_PATTERN = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g;
const TAG_PATTERN = /(^|[\s([{])#([a-zA-Z][a-zA-Z0-9_-]{1,31})\b/g;

type InlineNode = {
  type: string;
  text?: string;
  styles?: Record<string, unknown>;
  props?: Record<string, unknown>;
};

type InlineHit = {
  start: number;
  end: number;
  node: InlineNode;
};

function collectInlineHits(text: string): InlineHit[] {
  const hits: InlineHit[] = [];

  for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
    const title = match[1]?.trim();
    if (!title) continue;
    hits.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      node: { type: "noteLink", props: { title } },
    });
  }

  for (const match of text.matchAll(TAG_PATTERN)) {
    const prefix = match[1] ?? "";
    const name = match[2]?.trim();
    if (!name) continue;
    const start = (match.index ?? 0) + prefix.length;
    hits.push({
      start,
      end: start + 1 + name.length,
      node: { type: "tag", props: { name } },
    });
  }

  return hits.sort((left, right) => left.start - right.start);
}

export function parseInlineContent(
  text: string,
  baseStyles: Record<string, unknown> = {},
): InlineNode[] {
  if (!text) return [];
  const hits = collectInlineHits(text);
  if (hits.length === 0) {
    return [{ type: "text", text, styles: baseStyles }];
  }

  const result: InlineNode[] = [];
  let cursor = 0;

  for (const hit of hits) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) {
      result.push({ type: "text", text: text.slice(cursor, hit.start), styles: baseStyles });
    }
    result.push(hit.node);
    cursor = hit.end;
  }

  if (cursor < text.length) {
    result.push({ type: "text", text: text.slice(cursor), styles: baseStyles });
  }

  return result;
}

function upgradeBlockContent(blocks: PartialBlock[]): PartialBlock[] {
  return blocks.map((block) => {
    const next: PartialBlock = { ...block };
    const content = block.content;

    if (typeof content === "string") {
      const parsed = parseInlineContent(content);
      // biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
      next.content = parsed as any;
    } else if (Array.isArray(content)) {
      // biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
      next.content = content.flatMap((inline: any) => {
        if (inline?.type === "text" && typeof inline.text === "string") {
          return parseInlineContent(inline.text, inline.styles ?? {});
        }
        return [inline];
        // biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
      }) as any;
    }

    if (Array.isArray(block.children) && block.children.length > 0) {
      next.children = upgradeBlockContent(block.children as PartialBlock[]);
    }

    return next;
  });
}

export function flattenInlineChips(blocks: Block[] | PartialBlock[]): PartialBlock[] {
  return (blocks as PartialBlock[]).map((block) => {
    const next: PartialBlock = { ...block };
    const content = block.content;

    if (Array.isArray(content)) {
      // biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
      next.content = content.flatMap((inline: any) => {
        if (inline?.type === "noteLink") {
          const title = String(inline.props?.title ?? "").trim();
          if (!title) return [];
          return [{ type: "text", text: `[[${title}]]`, styles: {} }];
        }
        if (inline?.type === "tag") {
          const name = String(inline.props?.name ?? "").trim();
          if (!name) return [];
          return [{ type: "text", text: `#${name}`, styles: {} }];
        }
        return [inline];
        // biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
      }) as any;
    }

    if (Array.isArray(block.children) && block.children.length > 0) {
      next.children = flattenInlineChips(block.children as PartialBlock[]);
    }

    return next;
  });
}

export function markdownToRichDocument(markdown: string): RichTextDocument {
  const lines = markdown.split("\n");
  const blocks: PartialBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3;
      blocks.push({
        type: "heading",
        props: { level },
        // biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
        content: parseInlineContent(headingMatch[2]) as any,
      });
      i++;
      continue;
    }

    if (line.match(/^[-*]\s+/)) {
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        const text = lines[i].replace(/^[-*]\s+/, "");
        blocks.push({
          type: "bulletListItem",
          // biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
          content: parseInlineContent(text) as any,
        });
        i++;
      }
      continue;
    }

    if (line.match(/^\d+\.\s+/)) {
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        const text = lines[i].replace(/^\d+\.\s+/, "");
        blocks.push({
          type: "numberedListItem",
          // biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
          content: parseInlineContent(text) as any,
        });
        i++;
      }
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "codeBlock",
        props: { language: language || "plaintext" },
        content: codeLines.join("\n"),
      });
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      blocks.push({
        type: "paragraph",
        // biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
        content: parseInlineContent(line.slice(2)) as any,
      });
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    blocks.push({
      type: "paragraph",
      // biome-ignore lint/suspicious/noExplicitAny: schema-flexible content
      content: parseInlineContent(line) as any,
    });
    i++;
  }

  if (blocks.length === 0) {
    return [{ type: "paragraph", content: "" }];
  }

  return blocks as RichTextDocument;
}

export function cloneRichDocument(document: Block[]): RichTextDocument {
  return JSON.parse(JSON.stringify(document)) as RichTextDocument;
}

export function upgradeRichDocumentChips(document: RichTextDocument): RichTextDocument {
  return upgradeBlockContent(document) as RichTextDocument;
}
