/**
 * The document arithmetic behind an append. Quick capture and share-to-Skriuw
 * add a paragraph to an entry without the editor being mounted, so the
 * ProseMirror document and its Markdown are produced here and travel as one
 * ordinary `save_document` (`docs/specs/editor-save-recovery.md`).
 */

export type EntryBody = {
  documentJson: unknown;
  markdown: string;
  wordCount: number;
};

type ProseMirrorNode = {
  type?: unknown;
  content?: unknown;
};

const EMPTY_PARAGRAPH = { type: "paragraph" } as const;

export function emptyEntryDocument(): unknown {
  return { type: "doc", content: [EMPTY_PARAGRAPH] };
}

export function countWords(markdown: string): number {
  return markdown
    .replace(/^\s*#[^\n]*$/gm, "")
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

function paragraph(text: string): ProseMirrorNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

/**
 * A document's top-level blocks, or an empty list when the payload is not a
 * document this build recognises. An unreadable document is never overwritten:
 * `appendParagraphs` refuses instead, so a capture waits rather than
 * destroying an entry it could not parse.
 */
function blocksOf(documentJson: unknown): ProseMirrorNode[] | null {
  if (typeof documentJson !== "object" || documentJson === null) {
    return null;
  }
  const candidate = documentJson as ProseMirrorNode;
  if (candidate.type !== "doc") {
    return null;
  }
  if (candidate.content === undefined) {
    return [];
  }
  return Array.isArray(candidate.content) ? (candidate.content as ProseMirrorNode[]) : null;
}

/** Whether a block is the trailing empty paragraph every fresh entry carries. */
function isEmptyParagraph(block: ProseMirrorNode): boolean {
  if (block.type !== "paragraph") {
    return false;
  }
  return block.content === undefined || (Array.isArray(block.content) && block.content.length === 0);
}

export type AppendOutcome =
  | { ok: true; body: EntryBody }
  | { ok: false; reason: "unreadable-document" | "nothing-to-append" };

/**
 * Adds `lines` to the end of an entry. The empty paragraph a fresh entry is
 * created with is replaced rather than pushed down, so the first capture of a
 * day does not open the entry with a blank line.
 */
export function appendParagraphs(
  documentJson: unknown,
  markdown: string,
  lines: readonly string[],
): AppendOutcome {
  const trimmed = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  if (trimmed.length === 0) {
    return { ok: false, reason: "nothing-to-append" };
  }
  const blocks = blocksOf(documentJson);
  if (blocks === null) {
    return { ok: false, reason: "unreadable-document" };
  }
  const kept = blocks.length > 0 && isEmptyParagraph(blocks[blocks.length - 1]!)
    ? blocks.slice(0, -1)
    : blocks;
  const nextMarkdown = `${markdown.replace(/\s+$/, "")}${
    markdown.trim().length === 0 ? "" : "\n\n"
  }${trimmed.join("\n\n")}\n`;
  return {
    ok: true,
    body: {
      documentJson: { type: "doc", content: [...kept, ...trimmed.map(paragraph)] },
      markdown: nextMarkdown,
      wordCount: countWords(nextMarkdown),
    },
  };
}
