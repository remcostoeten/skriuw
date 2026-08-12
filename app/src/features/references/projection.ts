import { referencesEqual } from "./extract";
import { referenceKey, type NoteReferences, type StructuredReference } from "./types";

export type OutgoingReferences = ReadonlyMap<string, readonly StructuredReference[]>;

export type IncomingReferences = ReadonlyMap<string, readonly string[]>;

export type ReferenceProjection = {
  outgoingReferences: OutgoingReferences;
  incomingReferences: IncomingReferences;
};

export function buildReferenceProjection(
  references: readonly NoteReferences[],
): ReferenceProjection {
  const outgoing = new Map<string, readonly StructuredReference[]>();
  const incoming = new Map<string, string[]>();
  for (const entry of references) {
    if (entry.targets.length === 0) {
      continue;
    }
    outgoing.set(entry.noteId, entry.targets);
    for (const target of entry.targets) {
      const key = referenceKey(target.kind, target.targetId);
      const sources = incoming.get(key) ?? [];
      if (!sources.includes(entry.noteId)) {
        sources.push(entry.noteId);
        incoming.set(key, sources);
      }
    }
  }
  return { outgoingReferences: outgoing, incomingReferences: incoming };
}

function withoutSource(
  incoming: Map<string, readonly string[]>,
  key: string,
  noteId: string,
): void {
  const sources = incoming.get(key);
  if (!sources || !sources.includes(noteId)) {
    return;
  }
  const remaining = sources.filter((source) => source !== noteId);
  if (remaining.length === 0) {
    incoming.delete(key);
  } else {
    incoming.set(key, remaining);
  }
}

function withSource(
  incoming: Map<string, readonly string[]>,
  key: string,
  noteId: string,
): void {
  const sources = incoming.get(key);
  if (!sources) {
    incoming.set(key, [noteId]);
    return;
  }
  if (!sources.includes(noteId)) {
    incoming.set(key, [...sources, noteId]);
  }
}

export function updateNoteReferences(
  projection: ReferenceProjection,
  noteId: string,
  targets: readonly StructuredReference[],
): ReferenceProjection | null {
  const previous = projection.outgoingReferences.get(noteId) ?? [];
  if (referencesEqual(previous, targets)) {
    return null;
  }
  const outgoing = new Map(projection.outgoingReferences);
  if (targets.length === 0) {
    outgoing.delete(noteId);
  } else {
    outgoing.set(noteId, targets);
  }
  const incoming = new Map(projection.incomingReferences);
  const nextKeys = new Set(targets.map((target) => referenceKey(target.kind, target.targetId)));
  for (const target of previous) {
    const key = referenceKey(target.kind, target.targetId);
    if (!nextKeys.has(key)) {
      withoutSource(incoming, key, noteId);
    }
  }
  for (const key of nextKeys) {
    withSource(incoming, key, noteId);
  }
  return { outgoingReferences: outgoing, incomingReferences: incoming };
}

export function removeSourceNotes(
  projection: ReferenceProjection,
  removedNoteIds: readonly string[],
): ReferenceProjection | null {
  const affected = removedNoteIds.filter((noteId) =>
    projection.outgoingReferences.has(noteId),
  );
  if (affected.length === 0) {
    return null;
  }
  const outgoing = new Map(projection.outgoingReferences);
  const incoming = new Map(projection.incomingReferences);
  for (const noteId of affected) {
    const targets = outgoing.get(noteId) ?? [];
    outgoing.delete(noteId);
    for (const target of targets) {
      withoutSource(incoming, referenceKey(target.kind, target.targetId), noteId);
    }
  }
  return { outgoingReferences: outgoing, incomingReferences: incoming };
}

export function removeTarget(
  incoming: IncomingReferences,
  key: string,
): IncomingReferences {
  if (!incoming.has(key)) {
    return incoming;
  }
  const next = new Map(incoming);
  next.delete(key);
  return next;
}
