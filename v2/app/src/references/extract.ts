import { referenceKey, type StructuredReference } from "./types";

type JsonNode = {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
};

function isJsonNode(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null;
}

function referenceFromNode(node: JsonNode): StructuredReference | null {
  const attrs = node.attrs;
  if (!attrs || typeof attrs.id !== "string" || attrs.id.length === 0) {
    return null;
  }
  if (node.type === "tag_ref") {
    return { kind: "tag", targetId: attrs.id };
  }
  if (node.type === "mention_ref") {
    if (attrs.kind !== "person" && attrs.kind !== "note") {
      return null;
    }
    return { kind: attrs.kind, targetId: attrs.id };
  }
  return null;
}

export function extractReferences(documentJson: unknown): StructuredReference[] {
  const references: StructuredReference[] = [];
  const seen = new Set<string>();
  const pending: unknown[] = [documentJson];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!isJsonNode(value)) {
      continue;
    }
    const reference = referenceFromNode(value);
    if (reference) {
      const key = referenceKey(reference.kind, reference.targetId);
      if (!seen.has(key)) {
        seen.add(key);
        references.push(reference);
      }
    }
    if (Array.isArray(value.content)) {
      for (let index = value.content.length - 1; index >= 0; index -= 1) {
        pending.push(value.content[index]);
      }
    }
  }
  return references;
}

export function referencesEqual(
  left: readonly StructuredReference[],
  right: readonly StructuredReference[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (reference, index) =>
      reference.kind === right[index]?.kind && reference.targetId === right[index]?.targetId,
  );
}
