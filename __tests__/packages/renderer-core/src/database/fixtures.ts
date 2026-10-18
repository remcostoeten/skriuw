import type {
  NoteProperty,
  NotePropertyOption,
  WorkspaceNode,
  WorkspaceSnapshot,
} from "../../../../../packages/renderer-core/src/contracts/workspace";
import { createInitialState } from "../../../../../packages/renderer-core/src/store/store";
import type { RendererState } from "../../../../../packages/renderer-core/src/store/types";

export function node(
  id: string,
  kind: WorkspaceNode["kind"],
  parentId: string | null,
  rank: number,
  overrides: Partial<WorkspaceNode> = {},
): WorkspaceNode {
  return {
    id,
    kind,
    parentId,
    rank,
    title: id,
    icon: null,
    createdAt: rank,
    updatedAt: rank,
    deletedAt: null,
    pinnedAt: null,
    ...overrides,
  };
}

export function selectProperty(
  noteId: string,
  name: string,
  options: NotePropertyOption[],
  selected: string | null,
  position = 0,
): NoteProperty {
  return {
    noteId,
    id: `${noteId}_${position}`,
    name,
    value: { valueVersion: 1, type: "select", value: selected },
    options,
    position,
  };
}

export function numberProperty(
  noteId: string,
  name: string,
  value: number | null,
  position: number,
): NoteProperty {
  return {
    noteId,
    id: `${noteId}_${position}`,
    name,
    value: { valueVersion: 1, type: "number", value },
    options: [],
    position,
  };
}

export function textProperty(
  noteId: string,
  name: string,
  value: string,
  position: number,
): NoteProperty {
  return {
    noteId,
    id: `${noteId}_${position}`,
    name,
    value: { valueVersion: 1, type: "text", value },
    options: [],
    position,
  };
}

export function checkboxProperty(
  noteId: string,
  name: string,
  value: boolean,
  position: number,
): NoteProperty {
  return {
    noteId,
    id: `${noteId}_${position}`,
    name,
    value: { valueVersion: 1, type: "checkbox", value },
    options: [],
    position,
  };
}

function statusOptions(prefix: string): NotePropertyOption[] {
  return [
    { id: `${prefix}_todo`, label: "Todo", color: "gray" },
    { id: `${prefix}_doing`, label: "Doing", color: "blue" },
    { id: `${prefix}_done`, label: "Done", color: "green" },
  ];
}

/**
 * Projects (folder) holds Alpha, Beta, Gamma and an Archive folder with
 * Delta; Epsilon sits at the root, a journal entry under the journal root,
 * and Trashed is in the trash. Option IDs differ per note, as in real data.
 */
export function databaseSnapshot(): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: "epsilon",
    nodes: [
      node("projects", "folder", null, 1024, { title: "Projects" }),
      node("alpha", "note", "projects", 1024, { title: "Alpha" }),
      node("beta", "note", "projects", 2048, { title: "Beta" }),
      node("gamma", "note", "projects", 3072, { title: "Gamma", lockedAt: 5 }),
      node("archive", "folder", "projects", 4096, { title: "Archive" }),
      node("delta", "note", "archive", 1024, { title: "Delta" }),
      node("trashed", "note", "projects", 5120, { title: "Trashed", deletedAt: 9 }),
      node("epsilon", "note", null, 2048, { title: "Epsilon" }),
      node("journal-root", "folder", null, 4096, { title: "Journal" }),
      node("day", "note", "journal-root", 1024, { title: "Day" }),
    ],
    documents: ["alpha", "beta", "gamma", "delta", "trashed", "epsilon", "day"].map((noteId) => ({
      noteId,
      documentJson: {},
      markdown: "",
      revision: 1,
      wordCount: 10,
    })),
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "system",
      compactSidebar: false,
      showPageIcons: true,
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "normal",
      showLineNumbers: false,
      editorPlaceholder: "Write",
    },
    tags: [],
    people: [
      {
        id: "ada",
        name: "Ada",
        initials: null,
        color: null,
        note: null,
        createdAt: 1,
        updatedAt: 1,
        createdIn: null,
      },
    ],
    references: [],
    properties: [
      selectProperty("alpha", "Status", statusOptions("a"), "a_doing", 0),
      numberProperty("alpha", "Priority", 2, 1),
      checkboxProperty("alpha", "Shipped", false, 2),
      selectProperty("beta", " status ", statusOptions("b"), "b_done", 0),
      numberProperty("beta", "Priority", 1, 1),
      textProperty("gamma", "Status", "Blocked", 0),
      selectProperty("delta", "Status", statusOptions("d"), "d_todo", 0),
    ],
    propertyTemplates: [],
  };
}

export function databaseState(): RendererState {
  return createInitialState(databaseSnapshot());
}
