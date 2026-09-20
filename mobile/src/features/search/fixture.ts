import {
  WORKSPACE_PROTOCOL_VERSION,
  type WorkspaceDocument,
  type WorkspaceNode,
  type WorkspaceSettings,
  type WorkspaceSnapshot,
} from "../../../../shared/renderer-core/src/contracts/workspace";
import type {
  PersonRecord,
  StructuredReference,
  TagRecord,
} from "../../../../shared/renderer-core/src/references/types";

/** Notes the benchmark and the emulator end-to-end run measure against. */
export const FIXTURE_NOTE_COUNT = 1_000;

const FIXTURE_FOLDER_COUNT = 50;

const BASE_TIME = Date.UTC(2026, 0, 1);

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

const TAG_NAMES: readonly string[] = [
  "architecture",
  "benchmark",
  "design system",
  "editor",
  "mobile",
  "performance",
  "recovery",
  "search",
  "storage",
  "sync",
  "theme",
  "release",
];

const PERSON_NAMES: readonly string[] = [
  "Ada Lovelace",
  "Alan Turing",
  "Barbara Liskov",
  "Edsger Dijkstra",
  "Grace Hopper",
  "Ken Thompson",
  "Margaret Hamilton",
  "Radia Perlman",
];

const SUBJECTS: readonly string[] = [
  "index rebuild",
  "operation queue",
  "cold start",
  "sheet gesture",
  "token drift",
  "snapshot hydration",
  "revision conflict",
  "ranked snippet",
  "candidate set",
  "back stack",
];

const VERBS: readonly string[] = [
  "measures",
  "records",
  "bounds",
  "serializes",
  "reconciles",
  "projects",
];

const OBJECTS: readonly string[] = [
  "the durable write path",
  "every ranked hit the backend returns",
  "a query that names a tag nobody uses",
  "the working set hydrated at startup",
  "the projection storage can rebuild",
  "what the emulator reports under load",
];

/** Deterministic so two runs of the benchmark measure the same workspace. */
function nextSeed(seed: number): number {
  return (seed * 1_664_525 + 1_013_904_223) >>> 0;
}

function pick<T>(items: readonly T[], seed: number): T {
  const item = items[seed % items.length];
  if (item === undefined) {
    throw new Error("fixture pool is empty");
  }
  return item;
}

function folderId(index: number): string {
  return `fixture-folder-${index}`;
}

function noteId(index: number): string {
  return `fixture-note-${index.toString().padStart(4, "0")}`;
}

function tagId(index: number): string {
  return `fixture-tag-${index}`;
}

function personId(index: number): string {
  return `fixture-person-${index}`;
}

function node(
  id: string,
  kind: WorkspaceNode["kind"],
  parentId: string | null,
  title: string,
  rank: number,
): WorkspaceNode {
  return {
    id,
    kind,
    parentId,
    rank,
    title,
    icon: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME + rank,
    deletedAt: null,
    pinnedAt: null,
  };
}

function body(index: number, seed: number): string {
  const lines: string[] = [];
  for (let line = 0; line < 4; line += 1) {
    const step = nextSeed(seed + line * 7919);
    lines.push(
      `${pick(SUBJECTS, step >>> 3)} ${pick(VERBS, step >>> 11)} ${pick(OBJECTS, step >>> 17)}.`,
    );
  }
  lines.push(`Fixture note ${index} of ${FIXTURE_NOTE_COUNT}.`);
  return lines.join(" ");
}

function document(index: number, title: string, text: string): WorkspaceDocument {
  return {
    noteId: noteId(index),
    documentJson: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] },
        { type: "paragraph", content: [{ type: "text", text }] },
      ],
    },
    markdown: `# ${title}\n\n${text}\n`,
    revision: 1,
    wordCount: text.split(/\s+/).filter((word) => word.length > 0).length,
  };
}

/**
 * A workspace of {@link FIXTURE_NOTE_COUNT} notes across folders, tags and
 * people, with the reference projection populated so an operator query has a
 * real candidate set to narrow. Every value derives from the note's index, so
 * the same query costs the same work on every run and on every machine.
 */
export function thousandNoteSnapshot(): WorkspaceSnapshot {
  const nodes: WorkspaceNode[] = [];
  const documents: WorkspaceDocument[] = [];
  const references: { noteId: string; targets: StructuredReference[] }[] = [];

  const tags: TagRecord[] = TAG_NAMES.map((name, index) => ({
    id: tagId(index),
    name,
    color: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    createdIn: null,
  }));

  const people: PersonRecord[] = PERSON_NAMES.map((name, index) => ({
    id: personId(index),
    name,
    initials: null,
    color: null,
    note: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    createdIn: null,
  }));

  for (let index = 0; index < FIXTURE_FOLDER_COUNT; index += 1) {
    nodes.push(node(folderId(index), "folder", null, `Folder ${index}`, (index + 1) * 1_024));
  }

  for (let index = 0; index < FIXTURE_NOTE_COUNT; index += 1) {
    const seed = nextSeed(index * 2_654_435_761);
    const title = `${pick(SUBJECTS, seed >>> 5)} ${index}`;
    const text = body(index, seed);
    nodes.push(
      node(
        noteId(index),
        "note",
        folderId(index % FIXTURE_FOLDER_COUNT),
        title,
        (index + 1) * 1_024,
      ),
    );
    documents.push(document(index, title, text));

    const targets: StructuredReference[] = [
      { kind: "tag", targetId: tagId(index % TAG_NAMES.length) },
    ];
    if (index % 3 === 0) {
      targets.push({ kind: "person", targetId: personId(index % PERSON_NAMES.length) });
    }
    references.push({ noteId: noteId(index), targets });
  }

  return {
    protocolVersion: WORKSPACE_PROTOCOL_VERSION,
    activeNoteId: null,
    nodes,
    documents,
    historyHeaders: [],
    settings: SETTINGS,
    tags,
    people,
    references,
  };
}
