import type {
  NoteProperty,
  NotePropertyValue,
  WorkspaceOperation,
} from "@/contracts/workspace";
import { boundTitle } from "@/editor/note-title";
import type { RendererState } from "@/store/types";

export const DUPLICATE_TITLE_SUFFIX = " (copy)";

/**
 * Document attributes that identify a block *within one note* and must not be
 * shared with a copy. Reference chips (`tag_ref`, `mention_ref`) and image
 * blobs are deliberately absent: those ids point at workspace entities the copy
 * legitimately shares.
 */
const BLOCK_IDENTITY_ATTRS = ["taskId", "blockId"] as const;

export type IdFactory = () => string;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rewrites every per-note block identity to a fresh id, recording the mapping so
 * the note's Markdown copy can be rewritten to match.
 */
export function withFreshBlockIds(
  documentJson: unknown,
  createId: IdFactory,
  idMap: Map<string, string>,
): unknown {
  if (Array.isArray(documentJson)) {
    return documentJson.map((entry) => withFreshBlockIds(entry, createId, idMap));
  }
  if (!isRecord(documentJson)) {
    return documentJson;
  }
  const next: JsonRecord = {};
  for (const [key, value] of Object.entries(documentJson)) {
    if (key === "attrs" && isRecord(value)) {
      const attrs: JsonRecord = { ...value };
      for (const attr of BLOCK_IDENTITY_ATTRS) {
        const current = attrs[attr];
        if (typeof current === "string" && current.length > 0) {
          const replacement = idMap.get(current) ?? createId();
          idMap.set(current, replacement);
          attrs[attr] = replacement;
        }
      }
      next[key] = attrs;
      continue;
    }
    next[key] = withFreshBlockIds(value, createId, idMap);
  }
  return next;
}

function lastTextIndex(content: readonly unknown[]): number {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const entry = content[index];
    if (isRecord(entry) && entry.type === "text" && typeof entry.text === "string") {
      return index;
    }
  }
  return -1;
}

/**
 * Appends `suffix` to the trailing text of the document's first block, which is
 * where v2 keeps a note's title. Returns the input unchanged when the first
 * block carries no text, so callers can tell the retitle did not apply.
 */
export function suffixDocumentTitle(documentJson: unknown, suffix: string): unknown {
  if (!isRecord(documentJson) || !Array.isArray(documentJson.content)) {
    return documentJson;
  }
  const [first, ...rest] = documentJson.content;
  if (!isRecord(first) || !Array.isArray(first.content)) {
    return documentJson;
  }
  const index = lastTextIndex(first.content);
  if (index < 0) {
    return documentJson;
  }
  const target = first.content[index] as JsonRecord & { text: string };
  const content = [...first.content];
  content[index] = { ...target, text: `${target.text}${suffix}` };
  return { ...documentJson, content: [{ ...first, content }, ...rest] };
}

function textContent(node: JsonRecord): string {
  if (typeof node.text === "string") {
    return node.text;
  }
  if (!Array.isArray(node.content)) {
    return "";
  }
  return node.content
    .map((child) => (isRecord(child) ? textContent(child) : ""))
    .join("");
}

/**
 * The leading text v2 derives a note title from, read off a serialized document
 * instead of a live ProseMirror node. Mirrors `deriveTitle` so a copy's stored
 * title matches the one the editor will derive on the copy's first save.
 */
export function documentTitleText(documentJson: unknown): string {
  if (!isRecord(documentJson) || !Array.isArray(documentJson.content)) {
    return "";
  }
  const [first] = documentJson.content;
  return isRecord(first) ? textContent(first) : "";
}

export function remapMarkdownIds(
  markdown: string,
  idMap: ReadonlyMap<string, string>,
): string {
  let next = markdown;
  for (const [from, to] of idMap) {
    next = next.split(from).join(to);
  }
  return next;
}

/**
 * Appends `suffix` to the Markdown's first line when that line ends with the
 * note's title — the shape `# Title` produces. Anything else is left alone
 * rather than risk mangling a fence or table row.
 */
export function suffixMarkdownTitle(
  markdown: string,
  title: string,
  suffix: string,
): string {
  const breakAt = markdown.indexOf("\n");
  const firstLine = breakAt < 0 ? markdown : markdown.slice(0, breakAt);
  if (title.length === 0 || !firstLine.trimEnd().endsWith(title)) {
    return markdown;
  }
  const trimmed = firstLine.trimEnd();
  const trailing = firstLine.slice(trimmed.length);
  return `${trimmed}${suffix}${trailing}${breakAt < 0 ? "" : markdown.slice(breakAt)}`;
}

function duplicatePropertyValue(value: NotePropertyValue): NotePropertyValue {
  return value.type === "multi-select" || value.type === "person"
    ? { ...value, value: [...value.value] }
    : { ...value };
}

function duplicateProperty(
  property: NoteProperty,
  noteId: string,
  createId: IdFactory,
): NoteProperty {
  return {
    ...property,
    id: createId(),
    noteId,
    options: property.options.map((option) => ({ ...option })),
    value: duplicatePropertyValue(property.value),
  };
}

export type NoteDuplicatePlan = {
  noteId: string;
  title: string;
  operations: readonly WorkspaceOperation[];
};

/**
 * The operations that place a copy of `sourceId` directly after it in the same
 * folder. Pure so the identity and retitle rules stay unit-testable; `createId`
 * supplies every fresh id. Opening the copy is the caller's job, because which
 * pane it lands in is renderer state rather than a workspace operation.
 */
export function planNoteDuplicate(
  state: RendererState,
  sourceId: string,
  at: number,
  createId: IdFactory,
): NoteDuplicatePlan | null {
  const source = state.sourceNodes.get(sourceId);
  const document = state.documents.get(sourceId);
  if (
    source === undefined ||
    source.kind !== "note" ||
    source.deletedAt !== null ||
    document === undefined
  ) {
    return null;
  }
  const noteId = createId();
  const idMap = new Map<string, string>();
  const documentJson = suffixDocumentTitle(
    withFreshBlockIds(document.documentJson, createId, idMap),
    DUPLICATE_TITLE_SUFFIX,
  );
  const suffixedText = documentTitleText(documentJson);
  const title = boundTitle(
    suffixedText.length > 0 ? suffixedText : `${source.title}${DUPLICATE_TITLE_SUFFIX}`,
  );
  const markdown = suffixMarkdownTitle(
    remapMarkdownIds(document.markdown, idMap),
    source.title,
    DUPLICATE_TITLE_SUFFIX,
  );
  const operations: WorkspaceOperation[] = [
    {
      type: "create_note",
      id: noteId,
      title,
      placement: {
        parentId: source.parentId,
        position: { type: "after", anchorId: sourceId },
      },
      documentJson,
      markdown,
      at,
    },
  ];
  for (const property of state.propertiesByNoteId.get(sourceId) ?? []) {
    operations.push({
      type: "set_note_property",
      property: duplicateProperty(property, noteId, createId),
      at,
    });
  }
  return { noteId, title, operations };
}
