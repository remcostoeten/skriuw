import type { WorkspaceOperation } from "@/contracts/workspace";
import { countWords, productSchema, serializeProductMarkdown } from "@/editor/schema";
import type { RendererState } from "@/store/types";
import type { EntityKind } from "./entity-manager-model";
import { projectReferencingNotes } from "./reference-panel-model";

type JsonNode = {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
};

function isJsonNode(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null;
}

function matchesEntity(node: JsonNode, kind: EntityKind, sourceId: string): boolean {
  if (node.attrs?.id !== sourceId) {
    return false;
  }
  if (kind === "tag") {
    return node.type === "tag_ref";
  }
  return node.type === "mention_ref" && node.attrs?.kind === "person";
}

function rewriteNode(
  value: unknown,
  kind: EntityKind,
  sourceId: string,
  targetId: string,
  targetName: string,
): { node: unknown; changed: boolean } {
  if (!isJsonNode(value)) {
    return { node: value, changed: false };
  }
  let changed = false;
  let attrs = value.attrs;
  if (matchesEntity(value, kind, sourceId)) {
    attrs = { ...attrs, id: targetId, label: targetName };
    changed = true;
  }
  let content = value.content;
  if (Array.isArray(value.content)) {
    const rewritten = value.content.map((child) =>
      rewriteNode(child, kind, sourceId, targetId, targetName),
    );
    if (rewritten.some((entry) => entry.changed)) {
      changed = true;
      content = rewritten.map((entry) => entry.node);
    }
  }
  if (!changed) {
    return { node: value, changed: false };
  }
  return { node: { ...value, attrs, content }, changed: true };
}

/**
 * Builds the document saves that re-point every reference to `sourceId` at
 * `targetId`, so an entity can be merged without leaving dangling tokens. The
 * caller pairs these with a delete of the now-orphaned source entity.
 */
export function buildMergeSaveDocuments(
  state: RendererState,
  kind: EntityKind,
  sourceId: string,
  targetId: string,
): WorkspaceOperation[] {
  const target = kind === "tag" ? state.tags.get(targetId) : state.people.get(targetId);
  if (!target || sourceId === targetId) {
    return [];
  }
  const operations: WorkspaceOperation[] = [];
  const at = Date.now();
  for (const backlink of projectReferencingNotes(state, kind, sourceId)) {
    const record = state.documents.get(backlink.noteId);
    if (!record) {
      continue;
    }
    const { node, changed } = rewriteNode(
      record.documentJson,
      kind,
      sourceId,
      targetId,
      target.name,
    );
    if (!changed) {
      continue;
    }
    const document = productSchema.nodeFromJSON(node);
    operations.push({
      type: "save_document",
      noteId: backlink.noteId,
      documentJson: node,
      markdown: serializeProductMarkdown(document),
      wordCount: countWords(document),
      expectedRevision: record.revision,
      at,
    });
  }
  return operations;
}
