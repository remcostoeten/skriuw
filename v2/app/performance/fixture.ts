import type {
  WorkspaceDocument,
  WorkspaceNode,
  WorkspaceSettings,
  WorkspaceSnapshot,
} from "../src/contracts/workspace";
import type {
  NoteReferences,
  PersonRecord,
  ReferenceBootstrap,
  StructuredReference,
  TagRecord,
} from "../src/references/types";
import type { FixtureIdentity } from "./types";

type ProjectionMetadata = {
  name: string;
  noteCount: number;
  folderCount: number;
  nodeCount: number;
};

export type TreeProjection = {
  metadata: ProjectionMetadata;
  operationsDigest: string;
  activeNoteId: string | null;
  nodes: {
    id: string;
    parentId: string | null;
    kind: "note" | "folder";
    title: string;
  }[];
};

const FIXTURE_TIME = 1_753_000_000_000;
const MEASURED_NOTE_COUNT = 8;
const WORKING_SET_NOTE_COUNT = 100;

const settings: WorkspaceSettings = {
  settingsVersion: 1,
  theme: "dark",
  compactSidebar: true,
  showPageIcons: false,
  reduceMotion: true,
  rememberLastNote: true,
  editorFont: "sans",
  editorLineHeight: "normal",
  showLineNumbers: false,
  editorPlaceholder: "Start writing…",
};

function paragraph(block: number, note: number): unknown {
  return {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: `Block ${block + 1} in measured note ${note + 1} carries deterministic product text.`,
      },
    ],
  };
}

function documentJson(blockCount: number, note: number): unknown {
  return {
    type: "doc",
    content: Array.from({ length: blockCount }, (_, block) => paragraph(block, note)),
  };
}

function emptyDocument(): unknown {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function referenceBootstrap(noteIds: readonly string[]): ReferenceBootstrap {
  const tags: TagRecord[] = Array.from({ length: 1000 }, (_, index) => ({
    id: `performance-tag-${index}`,
    name: `Performance tag ${index.toString().padStart(4, "0")}`,
    color: null,
    createdAt: FIXTURE_TIME + index,
    updatedAt: FIXTURE_TIME + index,
    createdIn: null,
  }));
  const people: PersonRecord[] = Array.from({ length: 1000 }, (_, index) => ({
    id: `performance-person-${index}`,
    name: `Performance person ${index.toString().padStart(4, "0")}`,
    initials: null,
    color: null,
    note: null,
    createdAt: FIXTURE_TIME + index,
    updatedAt: FIXTURE_TIME + index,
    createdIn: null,
  }));
  const references: NoteReferences[] = noteIds.map((noteId, index) => {
    const targets: StructuredReference[] = [
      { kind: "tag", targetId: tags[index % tags.length]?.id ?? "" },
      { kind: "person", targetId: people[index % people.length]?.id ?? "" },
    ];
    const targetNoteId = noteIds[(index + 1) % noteIds.length];
    if (targetNoteId) {
      targets.push({ kind: "note", targetId: targetNoteId });
    }
    return { noteId, targets };
  });
  return { tags, people, references };
}

export function createPerformanceSnapshot(
  projection: TreeProjection,
  blockCount: number,
): { snapshot: WorkspaceSnapshot; identity: FixtureIdentity; references: ReferenceBootstrap } {
  const measuredNoteIds = projection.nodes
    .filter((node) => node.kind === "note")
    .slice(0, MEASURED_NOTE_COUNT)
    .map((node) => node.id);
  if (measuredNoteIds.length !== MEASURED_NOTE_COUNT) {
    throw new Error("performance fixture requires eight notes");
  }
  const measured = new Set(measuredNoteIds);
  const noteIds = projection.nodes
    .filter((node) => node.kind === "note")
    .map((node) => node.id);
  const workingSetNoteIds = noteIds.slice(0, WORKING_SET_NOTE_COUNT);
  const nodes: WorkspaceNode[] = projection.nodes.map((node, index) => ({
    ...node,
    rank: (index + 1) * 1024,
    icon: null,
    createdAt: FIXTURE_TIME + index,
    updatedAt: FIXTURE_TIME + index,
    deletedAt: null,
    pinnedAt: null,
  }));
  let measuredIndex = 0;
  const documents: WorkspaceDocument[] = projection.nodes.flatMap((node) => {
    if (node.kind !== "note") {
      return [];
    }
    const isMeasured = measured.has(node.id);
    const currentMeasuredIndex = measuredIndex;
    if (isMeasured) {
      measuredIndex += 1;
    }
    return [{
      noteId: node.id,
      documentJson: isMeasured ? documentJson(blockCount, currentMeasuredIndex) : emptyDocument(),
      markdown: "",
      revision: 1,
      wordCount: isMeasured ? blockCount * 10 : 0,
    }];
  });
  const referenceData = referenceBootstrap(noteIds);
  return {
    snapshot: {
      protocolVersion: 1,
      activeNoteId: measuredNoteIds[0] ?? null,
      nodes,
      documents,
      historyHeaders: [],
      settings,
      tags: [...referenceData.tags],
      people: [...referenceData.people],
      references: referenceData.references.map((entry) => ({
        noteId: entry.noteId,
        targets: [...entry.targets],
      })),
    },
    references: referenceData,
    identity: {
      name: projection.metadata.name,
      operationsDigest: projection.operationsDigest,
      nodeCount: projection.metadata.nodeCount,
      noteCount: projection.metadata.noteCount,
      folderCount: projection.metadata.folderCount,
      blockCount,
      measuredNoteIds,
      workingSetNoteIds,
    },
  };
}
