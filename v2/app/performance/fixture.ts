import type {
  WorkspaceDocument,
  WorkspaceNode,
  WorkspaceSettings,
  WorkspaceSnapshot,
} from "../src/contracts/workspace";
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

export function createPerformanceSnapshot(
  projection: TreeProjection,
  blockCount: number,
): { snapshot: WorkspaceSnapshot; identity: FixtureIdentity } {
  const measuredNoteIds = projection.nodes
    .filter((node) => node.kind === "note")
    .slice(0, MEASURED_NOTE_COUNT)
    .map((node) => node.id);
  if (measuredNoteIds.length !== MEASURED_NOTE_COUNT) {
    throw new Error("performance fixture requires eight notes");
  }
  const measured = new Set(measuredNoteIds);
  const nodes: WorkspaceNode[] = projection.nodes.map((node, index) => ({
    ...node,
    rank: (index + 1) * 1024,
    icon: null,
    createdAt: FIXTURE_TIME + index,
    updatedAt: FIXTURE_TIME + index,
    deletedAt: null,
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
  return {
    snapshot: {
      protocolVersion: 1,
      activeNoteId: measuredNoteIds[0] ?? null,
      nodes,
      documents,
      historyHeaders: [],
      settings,
    },
    identity: {
      name: projection.metadata.name,
      operationsDigest: projection.operationsDigest,
      nodeCount: projection.metadata.nodeCount,
      noteCount: projection.metadata.noteCount,
      folderCount: projection.metadata.folderCount,
      blockCount,
      measuredNoteIds,
    },
  };
}
