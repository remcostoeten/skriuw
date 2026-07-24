import type {
  WorkspaceDocument,
  WorkspaceNode,
  WorkspaceSettings,
  WorkspaceSnapshot,
} from "../src/contracts/workspace";

const now = 1_753_000_000_000;

const settings: WorkspaceSettings = {
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

function node(
  id: string,
  kind: WorkspaceNode["kind"],
  title: string,
  parentId: string | null,
  rank: number,
): WorkspaceNode {
  return {
    id,
    kind,
    title,
    parentId,
    rank,
    icon: null,
    createdAt: now + rank,
    updatedAt: now + rank,
    deletedAt: null,
  };
}

function document(noteId: string, text: string): WorkspaceDocument {
  return {
    noteId,
    documentJson: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: text ? [{ type: "text", text }] : undefined,
        },
      ],
    },
    markdown: text,
    revision: 1,
    wordCount: text.split(/\s+/u).filter(Boolean).length,
  };
}

export function createWorkflowSnapshot(): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    nodes: [
      node("folder-a", "folder", "Projects", null, 1024),
      node("note-alpha", "note", "Alpha note", "folder-a", 1024),
      node("note-beta", "note", "Beta note", "folder-a", 2048),
      node("folder-b", "folder", "Archive", null, 2048),
      node("note-gamma", "note", "Gamma note", "folder-b", 1024),
      node("note-root", "note", "Root note", null, 3072),
    ],
    documents: [
      document("note-alpha", "alpha target alpha"),
      document("note-beta", "beta writing"),
      document("note-gamma", "gamma content"),
      document("note-root", "root content"),
    ],
    settings,
    activeNoteId: "note-alpha",
    tags: [
      {
        id: "tag-research",
        name: "Research",
        color: "#3b82f6",
        createdAt: now - 5_000,
        updatedAt: now - 5_000,
        createdIn: "note-alpha",
      },
      {
        id: "tag-ideas",
        name: "Ideas",
        color: null,
        createdAt: now - 4_000,
        updatedAt: now - 4_000,
        createdIn: null,
      },
    ],
    people: [],
    references: [
      { noteId: "note-alpha", targets: [{ kind: "tag", targetId: "tag-research" }] },
      {
        noteId: "note-gamma",
        targets: [
          { kind: "tag", targetId: "tag-research" },
          { kind: "tag", targetId: "tag-ideas" },
        ],
      },
    ],
    historyHeaders: [
      {
        noteId: "note-alpha",
        versionId: "version-alpha-1",
        createdAt: now - 10_000,
        summary: "Earlier alpha version",
      },
    ],
  };
}
