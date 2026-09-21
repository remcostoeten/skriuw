import {
  WORKSPACE_PROTOCOL_VERSION,
  type WorkspaceDocument,
  type WorkspaceNode,
  type WorkspaceSettings,
  type WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";

const BASE_TIME = Date.UTC(2026, 8, 1);

const SETTINGS: WorkspaceSettings = {
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

type Seed = {
  id: string;
  kind: WorkspaceNode["kind"];
  parentId: string | null;
  title: string;
  pinned?: boolean;
  body?: string;
};

const SEEDS: readonly Seed[] = [
  { id: "folder-field-notes", kind: "folder", parentId: null, title: "Field notes" },
  {
    id: "note-native-shell",
    kind: "note",
    parentId: "folder-field-notes",
    title: "Native shell",
    pinned: true,
    body: "The toolbar, tab bar and sheet are native views over the shared store.",
  },
  {
    id: "note-edge-swipe",
    kind: "note",
    parentId: "folder-field-notes",
    title: "Edge swipe",
    body: "A pull from the left edge opens the tree; a pull back closes it.",
  },
  { id: "folder-reading", kind: "folder", parentId: "folder-field-notes", title: "Reading" },
  {
    id: "note-uniffi",
    kind: "note",
    parentId: "folder-reading",
    title: "UniFFI facade",
    body: "One facade over the Rust core, wrapped by an Expo native module.",
  },
  { id: "folder-journal-drafts", kind: "folder", parentId: null, title: "Drafts" },
  {
    id: "note-release-checklist",
    kind: "note",
    parentId: "folder-journal-drafts",
    title: "Release checklist",
    body: "Store metadata, export compliance, benchmarks.",
  },
  {
    id: "note-inbox",
    kind: "note",
    parentId: null,
    title: "Inbox",
    body: "Anything caught from the share sheet lands here.",
  },
];

function node(seed: Seed, rank: number): WorkspaceNode {
  return {
    id: seed.id,
    kind: seed.kind,
    parentId: seed.parentId,
    rank,
    title: seed.title,
    icon: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    deletedAt: null,
    pinnedAt: seed.pinned ? BASE_TIME : null,
  };
}

function document(seed: Seed): WorkspaceDocument {
  const body = seed.body ?? "";
  return {
    noteId: seed.id,
    documentJson: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: seed.title }] },
        body.length > 0
          ? { type: "paragraph", content: [{ type: "text", text: body }] }
          : { type: "paragraph" },
      ],
    },
    markdown: `# ${seed.title}\n\n${body}\n`,
    revision: 1,
    wordCount: body.split(/\s+/).filter((word) => word.length > 0).length,
  };
}

/**
 * The workspace the shell opens against the in-memory adapter until the
 * native module is wired in (`docs/specs/mobile-app.md`, work breakdown:
 * Mobile 07 builds against the adapter so interface work never waits for it).
 */
export function demoSnapshot(): WorkspaceSnapshot {
  return {
    protocolVersion: WORKSPACE_PROTOCOL_VERSION,
    activeNoteId: "note-native-shell",
    nodes: SEEDS.map((seed, index) => node(seed, (index + 1) * 1024)),
    documents: SEEDS.filter((seed) => seed.kind === "note").map(document),
    historyHeaders: [],
    settings: SETTINGS,
    tags: [],
    people: [],
    references: [],
  };
}
