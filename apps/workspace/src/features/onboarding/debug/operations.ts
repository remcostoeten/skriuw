import type { NoteProperty, WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_ROOT_ID,
  JOURNAL_ROOT_TITLE,
} from "@/features/journal/model";
import { documentJson, emptyDocument, markdown, type Block } from "./document";
import {
  ARCHIVE_ID,
  journalSeeds,
  NOTES,
  PEOPLE,
  PROJECTS_ID,
  RESEARCH_ID,
  ROOT_ID,
  TAGS,
} from "./fixture";

/**
 * Trashing a folder stamps `deletedAt` on the folder alone, so a fixture note
 * whose ancestor was trashed still reads as live on its own record. The seed
 * walks the chain the way the workspace does and leaves a trashed fixture note
 * alone: reviving it would mean restoring the directly-trashed ancestor, which
 * is the workspace's decision to make, not the fixture's.
 */
function trashed(store: RendererStore, id: string): boolean {
  const state = store.getState();
  let node = state.sourceNodes.get(id);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    if (node.deletedAt !== null) return true;
    seen.add(node.id);
    node = node.parentId === null ? undefined : state.sourceNodes.get(node.parentId);
  }
  return false;
}

function folder(
  id: string,
  title: string,
  parentId: string | null,
  at: number,
): WorkspaceOperation {
  return {
    type: "create_folder",
    id,
    title,
    placement: { parentId, position: { type: "last" } },
    at,
  };
}

export function creationOperations(store: RendererStore, at: number): WorkspaceOperation[] {
  const state = store.getState();
  const operations: WorkspaceOperation[] = [];

  for (const record of TAGS) {
    if (state.tags.has(record.id)) continue;
    operations.push({
      type: "create_tag",
      tag: { ...record, color: null, createdAt: at, updatedAt: at, createdIn: null },
    });
  }
  for (const record of PEOPLE) {
    if (state.people.has(record.id)) continue;
    operations.push({
      type: "create_person",
      person: {
        ...record,
        initials: null,
        color: null,
        note: null,
        createdAt: at,
        updatedAt: at,
        createdIn: null,
      },
    });
  }

  const folders: [string, string, string | null][] = [
    [ROOT_ID, "Relationship demo", null],
    [PROJECTS_ID, "Projects", ROOT_ID],
    [RESEARCH_ID, "Research", ROOT_ID],
    [ARCHIVE_ID, "Archive", ROOT_ID],
  ];
  for (const [id, title, parentId] of folders) {
    if (state.sourceNodes.has(id)) continue;
    operations.push(folder(id, title, parentId, at));
  }

  for (const seed of NOTES) {
    const existing = state.sourceNodes.get(seed.id);
    if (existing) {
      if (trashed(store, seed.id)) continue;
      if (existing.parentId !== seed.parentId) {
        operations.push({
          type: "move_node",
          id: seed.id,
          placement: { parentId: seed.parentId, position: { type: "last" } },
          at,
        });
      }
      if (existing.title !== seed.title) {
        operations.push({ type: "rename_node", id: seed.id, title: seed.title, at });
      }
      continue;
    }
    operations.push({
      type: "create_note",
      id: seed.id,
      title: seed.title,
      placement: { parentId: seed.parentId, position: { type: "last" } },
      documentJson: emptyDocument(),
      markdown: "",
      at,
    });
  }

  const journalMissing = journalSeeds().filter((entry) => !state.sourceNodes.has(entry.id));
  if (journalMissing.length > 0 && !state.sourceNodes.has(JOURNAL_ROOT_ID)) {
    operations.push(folder(JOURNAL_ROOT_ID, JOURNAL_ROOT_TITLE, null, at));
  }
  for (const entry of journalMissing) {
    const property: NoteProperty = {
      noteId: entry.id,
      id: JOURNAL_DATE_PROPERTY_ID,
      name: "Date",
      value: { valueVersion: 1, type: "date", value: entry.dateKey },
      options: [],
      position: 0,
    };
    operations.push(
      {
        type: "create_note",
        id: entry.id,
        title: "Untitled",
        placement: { parentId: JOURNAL_ROOT_ID, position: { type: "last" } },
        documentJson: emptyDocument(),
        markdown: "",
        at,
      },
      { type: "set_note_property", property, at },
    );
  }

  return operations;
}

/**
 * A note cannot link to a sibling that the same transaction has not created
 * yet — the reference writer rejects the dangling target — and several of these
 * notes link to each other. Bodies therefore land in a second commit, once
 * every target exists.
 *
 * Bodies are rewritten rather than filled in only when empty, so re-running the
 * seed after editing the fixture definition refreshes an existing workspace
 * instead of leaving stale content behind.
 */
export function contentOperations(store: RendererStore, at: number): WorkspaceOperation[] {
  const state = store.getState();
  const bodies: { id: string; body: Block[] }[] = [
    ...NOTES.map((seed) => ({ id: seed.id, body: seed.body })),
    ...journalSeeds().map((entry) => ({ id: entry.id, body: entry.body })),
  ];
  const operations: WorkspaceOperation[] = [];
  for (const entry of bodies) {
    const document = state.documents.get(entry.id);
    if (!document) continue;
    const text = markdown(entry.body);
    if (document.markdown === text) continue;
    operations.push({
      type: "save_document",
      noteId: entry.id,
      documentJson: documentJson(entry.body),
      markdown: text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      expectedRevision: document.revision,
      at,
    });
  }
  return operations;
}
