import { JOURNAL_ROOT_ID, journalEntryDateKey } from "@/features/journal/model";
import type { RendererState } from "@/store/types";
import { referenceKey, type ReferenceKind } from "./types";

export type RelationshipNote = {
  noteId: string;
  title: string;
  updatedAt: number;
  sharedEntityIds: readonly string[];
};

export type RelatedJournalEntry = RelationshipNote & {
  dateKey: string;
  score: number;
  directIncoming: boolean;
  directOutgoing: boolean;
  sharedPersonIds: readonly string[];
  sharedTagIds: readonly string[];
};

export type GraphNode = {
  id: string;
  label: string;
  kind: "current" | "note" | "tag" | "person";
};
export type GraphEdge = { from: string; to: string };
export type RelationshipGraph = {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  hiddenCount: number;
};

function availableNote(state: RendererState, noteId: string): boolean {
  let node = state.sourceNodes.get(noteId);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    if (node.deletedAt !== null) return false;
    seen.add(node.id);
    node = node.parentId === null ? undefined : state.sourceNodes.get(node.parentId);
  }
  return state.nodes.get(noteId)?.kind === "note";
}

function idsFor(state: RendererState, noteId: string, kind: ReferenceKind): string[] {
  const ids = new Set<string>();
  for (const target of state.outgoingReferences.get(noteId) ?? []) {
    if (target.kind === kind) ids.add(target.targetId);
  }
  return [...ids];
}

export function projectSharedEntities(
  state: RendererState,
  noteId: string,
  kind: "tag" | "person",
): RelationshipNote[] {
  const currentIds = idsFor(state, noteId, kind).filter((id) =>
    kind === "tag" ? state.tags.has(id) : state.people.has(id),
  );
  const overlaps = new Map<string, Set<string>>();
  for (const entityId of currentIds) {
    for (const candidateId of state.incomingReferences.get(referenceKey(kind, entityId)) ?? []) {
      if (
        candidateId === noteId ||
        state.sourceNodes.get(candidateId)?.parentId === JOURNAL_ROOT_ID ||
        !availableNote(state, candidateId)
      ) {
        continue;
      }
      const shared = overlaps.get(candidateId) ?? new Set<string>();
      shared.add(entityId);
      overlaps.set(candidateId, shared);
    }
  }
  return [...overlaps].map(([candidateId, shared]) => {
    const metadata = state.metadata.get(candidateId)!;
    return {
      noteId: candidateId,
      title: metadata.title,
      updatedAt: metadata.updatedAt,
      sharedEntityIds: [...shared],
    };
  }).sort(
    (a, b) =>
      b.sharedEntityIds.length - a.sharedEntityIds.length ||
      b.updatedAt - a.updatedAt ||
      a.title.localeCompare(b.title),
  );
}

export function projectRelatedJournalEntries(state: RendererState, noteId: string): RelatedJournalEntry[] {
  const personIds = new Set(idsFor(state, noteId, "person"));
  const tagIds = new Set(idsFor(state, noteId, "tag"));
  const incoming = new Set(state.incomingReferences.get(referenceKey("note", noteId)) ?? []);
  const outgoing = new Set(idsFor(state, noteId, "note"));
  const result: RelatedJournalEntry[] = [];
  for (const candidateId of state.childrenByParent.get(JOURNAL_ROOT_ID) ?? []) {
    if (candidateId === noteId || !availableNote(state, candidateId)) {
      continue;
    }
    const dateKey = journalEntryDateKey(state, candidateId);
    if (!dateKey) continue;
    const sharedPersonIds = idsFor(state, candidateId, "person").filter((id) => personIds.has(id));
    const sharedTagIds = idsFor(state, candidateId, "tag").filter((id) => tagIds.has(id));
    const directIncoming = incoming.has(candidateId);
    const directOutgoing = outgoing.has(candidateId);
    const score =
      (directIncoming ? 10000 : 0) +
      (directOutgoing ? 9000 : 0) +
      sharedPersonIds.length * 3 +
      sharedTagIds.length * 2;
    if (score === 0) {
      continue;
    }
    const metadata = state.metadata.get(candidateId)!;
    result.push({
      noteId: candidateId,
      title: metadata.title,
      updatedAt: metadata.updatedAt,
      dateKey,
      score,
      directIncoming,
      directOutgoing,
      sharedPersonIds,
      sharedTagIds,
      sharedEntityIds: [...sharedPersonIds, ...sharedTagIds],
    });
  }
  return result.sort((a, b) => b.score - a.score || b.dateKey.localeCompare(a.dateKey) || a.title.localeCompare(b.title));
}

export function projectCoVisitedNotes(state: RendererState, noteId: string): RelationshipNote[] {
  return [...(state.coVisits.get(noteId) ?? [])]
    .filter(([candidateId]) => candidateId !== noteId && availableNote(state, candidateId))
    .sort((a, b) => {
      const score = (entry: readonly [string, { count: number; lastVisitedAt: number }]) =>
        entry[1].count * 10 +
        Math.max(0, 9 - Math.floor((Date.now() - entry[1].lastVisitedAt) / 86_400_000));
      return score(b) - score(a) || b[1].lastVisitedAt - a[1].lastVisitedAt;
    })
    .map(([candidateId]) => {
      const metadata = state.metadata.get(candidateId)!;
      return {
        noteId: candidateId,
        title: metadata.title,
        updatedAt: metadata.updatedAt,
        sharedEntityIds: [],
      };
    });
}

export function projectRelationshipGraph(state: RendererState, noteId: string): RelationshipGraph {
  const nodes: GraphNode[] = [
    {
      id: noteId,
      label: state.metadata.get(noteId)?.title ?? "Current note",
      kind: "current",
    },
  ];
  const edges: GraphEdge[] = [];
  const add = (id: string, label: string, kind: GraphNode["kind"], from: string, to: string) => {
    if (nodes.length >= 24 || edges.length >= 48 || nodes.some((node) => node.id === id)) {
      return;
    }
    nodes.push({ id, label, kind });
    edges.push({ from, to });
  };
  for (const entry of state.incomingReferences.get(referenceKey("note", noteId)) ?? []) {
    if (availableNote(state, entry)) {
      add(entry, state.metadata.get(entry)?.title ?? "Untitled", "note", entry, noteId);
    }
  }
  for (const entry of idsFor(state, noteId, "note")) {
    if (availableNote(state, entry)) {
      add(entry, state.metadata.get(entry)?.title ?? "Untitled", "note", noteId, entry);
    }
  }
  for (const id of idsFor(state, noteId, "tag")) {
    const tag = state.tags.get(id);
    if (tag) add(`tag:${id}`, `#${tag.name}`, "tag", noteId, `tag:${id}`);
  }
  for (const id of idsFor(state, noteId, "person")) {
    const person = state.people.get(id);
    if (person) add(`person:${id}`, `$${person.name}`, "person", noteId, `person:${id}`);
  }
  const total =
    (state.incomingReferences.get(referenceKey("note", noteId))?.length ?? 0) +
    idsFor(state, noteId, "note").length +
    idsFor(state, noteId, "tag").length +
    idsFor(state, noteId, "person").length;
  return { nodes, edges, hiddenCount: Math.max(0, total - (nodes.length - 1)) };
}
