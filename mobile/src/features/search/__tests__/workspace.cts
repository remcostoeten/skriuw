import {
  WORKSPACE_PROTOCOL_VERSION,
  type WorkspaceDocument,
  type WorkspaceNode,
  type WorkspaceSettings,
  type WorkspaceSnapshot,
} from "../../../../../shared/renderer-core/src/contracts/workspace";
import type {
  PersonRecord,
  StructuredReference,
  TagRecord,
} from "../../../../../shared/renderer-core/src/references/types";
import { createInitialState, createRendererStore } from "../../../../../shared/renderer-core/src/store/store";
import type { RendererState, RendererStore } from "../../../../../shared/renderer-core/src/store/types";

const BASE_TIME = Date.UTC(2026, 0, 1);

export const TEST_SETTINGS: WorkspaceSettings = {
  settingsVersion: 1,
  theme: "midnight",
  compactSidebar: false,
  showPageIcons: true,
  reduceMotion: false,
  rememberLastNote: true,
  editorFont: "inter",
  editorLineHeight: "comfortable",
  showLineNumbers: true,
  editorPlaceholder: "Start writing...",
};

export type NoteSeed = {
  id: string;
  title: string;
  body: string;
  tags?: readonly string[];
  people?: readonly string[];
  updatedAt?: number;
};

type Options = {
  notes: readonly NoteSeed[];
  tags?: readonly string[];
  people?: readonly string[];
  settings?: WorkspaceSettings;
};

function entityId(kind: string, name: string): string {
  return `${kind}-${name.toLowerCase().replace(/\s+/g, "-")}`;
}

export function snapshotOf(options: Options): WorkspaceSnapshot {
  const nodes: WorkspaceNode[] = [];
  const documents: WorkspaceDocument[] = [];
  const references: { noteId: string; targets: StructuredReference[] }[] = [];

  options.notes.forEach((seed, index) => {
    nodes.push({
      id: seed.id,
      kind: "note",
      parentId: null,
      rank: (index + 1) * 1_024,
      title: seed.title,
      icon: null,
      createdAt: BASE_TIME,
      updatedAt: seed.updatedAt ?? BASE_TIME + index,
      deletedAt: null,
      pinnedAt: null,
    });
    documents.push({
      noteId: seed.id,
      documentJson: { type: "doc", content: [] },
      markdown: `# ${seed.title}\n\n${seed.body}\n`,
      revision: 1,
      wordCount: seed.body.split(/\s+/).filter((word) => word.length > 0).length,
    });
    const targets: StructuredReference[] = [
      ...(seed.tags ?? []).map((name) => ({ kind: "tag" as const, targetId: entityId("tag", name) })),
      ...(seed.people ?? []).map((name) => ({
        kind: "person" as const,
        targetId: entityId("person", name),
      })),
    ];
    references.push({ noteId: seed.id, targets });
  });

  const tags: TagRecord[] = (options.tags ?? []).map((name) => ({
    id: entityId("tag", name),
    name,
    color: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    createdIn: null,
  }));
  const people: PersonRecord[] = (options.people ?? []).map((name) => ({
    id: entityId("person", name),
    name,
    initials: null,
    color: null,
    note: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    createdIn: null,
  }));

  return {
    protocolVersion: WORKSPACE_PROTOCOL_VERSION,
    activeNoteId: null,
    nodes,
    documents,
    historyHeaders: [],
    settings: options.settings ?? TEST_SETTINGS,
    tags,
    people,
    references,
  };
}

export function storeOf(snapshot: WorkspaceSnapshot): RendererStore {
  return createRendererStore(
    createInitialState(snapshot, undefined, {
      tags: snapshot.tags,
      people: snapshot.people,
      references: snapshot.references,
    }),
  );
}

export function stateOf(options: Options): RendererState {
  return storeOf(snapshotOf(options)).getState();
}

/** Tags and people are addressed by their generated id, so tests can name them. */
export { entityId };
