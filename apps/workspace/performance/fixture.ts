import type {
  HistoryHeader,
  NoteProperty,
  SearchHit,
  WorkspaceAnnotation,
  WorkspaceDocument,
  WorkspaceNode,
  WorkspaceSettings,
  WorkspaceSnapshot,
  WorkspaceTask,
} from "@skriuw/renderer-core/contracts/workspace";
import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_MOOD_PROPERTY_ID,
  JOURNAL_ROOT_ID,
  JOURNAL_ROOT_TITLE,
} from "@skriuw/renderer-core/journal/constants";
import type {
  NoteReferences,
  PersonRecord,
  ReferenceBootstrap,
  StructuredReference,
  TagRecord,
} from "@skriuw/renderer-core/references/types";
import {
  journalDocument,
  measuredDocument,
  ordinaryDocument,
  type ContentReferences,
  type GeneratedDocument,
} from "./fixture-content";
import type { FixtureContent, FixtureIdentity } from "./types";

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

export type PerformanceFixture = {
  snapshot: WorkspaceSnapshot;
  identity: FixtureIdentity;
  references: ReferenceBootstrap;
  searchHits: ReadonlyMap<string, readonly SearchHit[]>;
};

const FIXTURE_TIME = 1_753_000_000_000;
const DAY_MS = 86_400_000;
const MEASURED_NOTE_COUNT = 8;
const WORKING_SET_NOTE_COUNT = 100;
const JOURNAL_ENTRY_COUNT = 120;
const MOODS = ["great", "good", "neutral", "low", "rough"] as const;

export const FIXTURE_CONTENT_VERSIONS: Record<FixtureContent, number> = {
  plain: 1,
  varied: 2,
};

const settings: WorkspaceSettings = {
  onboardingVersion: 1,
  savedSearches: ["#design", "$Ada", "planning"],
  settingsVersion: 1,
  theme: "dark",
  compactSidebar: true,
  showPageIcons: false,
  rememberLastNote: true,
  editorFont: "sans",
  editorLineHeight: "normal",
  showLineNumbers: false,
  editorPlaceholder: "Start writing…",
};

type PlainNode =
  | { type: "paragraph"; content?: PlainNode[] }
  | { type: "text"; text: string; marks?: { type: "link"; attrs: { href: string } }[] }
  | { type: "doc"; content: PlainNode[] };

function plainParagraph(block: number, note: number): PlainNode {
  const text: PlainNode = {
    type: "text",
    text: `Block ${block + 1} in measured note ${note + 1} carries deterministic product text.`,
  };
  if (block !== 0) {
    return { type: "paragraph", content: [text] };
  }
  return {
    type: "paragraph",
    content: [
      text,
      {
        type: "text",
        text: "linked words",
        marks: [{ type: "link", attrs: { href: "https://example.com" } }],
      },
    ],
  };
}

function plainDocument(blockCount: number, note: number): PlainNode {
  return {
    type: "doc",
    content: Array.from({ length: blockCount }, (_, block) => plainParagraph(block, note)),
  };
}

function emptyDocument(): PlainNode {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function createTags(): TagRecord[] {
  return Array.from({ length: 1000 }, (_, index) => ({
    id: `performance-tag-${index}`,
    name: `Performance tag ${index.toString().padStart(4, "0")}`,
    color: null,
    createdAt: FIXTURE_TIME + index,
    updatedAt: FIXTURE_TIME + index,
    createdIn: null,
  }));
}

function createPeople(): PersonRecord[] {
  return Array.from({ length: 1000 }, (_, index) => ({
    id: `performance-person-${index}`,
    name: `Performance person ${index.toString().padStart(4, "0")}`,
    initials: null,
    color: null,
    note: null,
    createdAt: FIXTURE_TIME + index,
    updatedAt: FIXTURE_TIME + index,
    createdIn: null,
  }));
}

function plainReferences(
  noteIds: readonly string[],
  tags: readonly TagRecord[],
  people: readonly PersonRecord[],
): NoteReferences[] {
  return noteIds.map((noteId, index) => {
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
}

function generatedReferences(noteId: string, generated: GeneratedDocument): NoteReferences {
  return {
    noteId,
    targets: [
      ...generated.tagIds.map((targetId) => ({ kind: "tag" as const, targetId })),
      ...generated.personIds.map((targetId) => ({ kind: "person" as const, targetId })),
      ...generated.linkedNoteIds.map((targetId) => ({ kind: "note" as const, targetId })),
    ],
  };
}

function historyHeaders(noteId: string, index: number, wordCount: number): HistoryHeader[] {
  return Array.from({ length: 2 + (index % 6) }, (_, version) => ({
    noteId,
    versionId: `${noteId}-v${version + 1}`,
    createdAt: FIXTURE_TIME + index * 1_000 + version * 3_600_000,
    summary: version === 0 ? "Created note" : `Edited ${1 + ((index + version) % 7)} blocks`,
    additions: 4 + ((index * 3 + version) % 40),
    deletions: (index + version * 5) % 18,
    wordCount: Math.max(0, wordCount - (5 - version) * 12),
  }));
}

function dateKey(entry: number): string {
  return new Date(FIXTURE_TIME - entry * DAY_MS).toISOString().slice(0, 10);
}

function journalProperties(noteId: string, entry: number): NoteProperty[] {
  const properties: NoteProperty[] = [
    {
      noteId,
      id: JOURNAL_DATE_PROPERTY_ID,
      name: "Date",
      value: { valueVersion: 1, type: "date", value: dateKey(entry) },
      options: [],
      position: 0,
    },
  ];
  if (entry % 3 === 0) {
    properties.push({
      noteId,
      id: JOURNAL_MOOD_PROPERTY_ID,
      name: "Mood",
      value: { valueVersion: 1, type: "select", value: MOODS[entry % MOODS.length] ?? "neutral" },
      options: [
        { id: "great", label: "Great", color: "green" },
        { id: "good", label: "Good", color: "teal" },
        { id: "neutral", label: "Neutral", color: "gray" },
        { id: "low", label: "Low", color: "amber" },
        { id: "rough", label: "Rough", color: "red" },
      ],
      position: 1,
    });
  }
  return properties;
}

function addSearchHit(hits: Map<string, SearchHit[]>, title: string, hit: SearchHit): void {
  const key = title.toLowerCase();
  const existing = hits.get(key);
  if (existing) {
    existing.push(hit);
  } else {
    hits.set(key, [hit]);
  }
}

function sortedSearchHits(hits: Map<string, SearchHit[]>): Map<string, SearchHit[]> {
  for (const list of hits.values()) {
    list.sort((left, right) => right.score - left.score || left.noteId.localeCompare(right.noteId));
  }
  return hits;
}

function projectionNodes(projection: TreeProjection): WorkspaceNode[] {
  return projection.nodes.map((node, index) => ({
    ...node,
    rank: (index + 1) * 1024,
    icon: null,
    createdAt: FIXTURE_TIME + index,
    updatedAt: FIXTURE_TIME + index,
    deletedAt: null,
    pinnedAt: null,
  }));
}

function selectNoteIds(projection: TreeProjection) {
  const noteIds = projection.nodes.filter((node) => node.kind === "note").map((node) => node.id);
  const measuredNoteIds = noteIds.slice(0, MEASURED_NOTE_COUNT);
  if (measuredNoteIds.length !== MEASURED_NOTE_COUNT) {
    throw new Error("performance fixture requires eight notes");
  }
  const workingSetNoteIds = noteIds.slice(0, WORKING_SET_NOTE_COUNT);
  if (workingSetNoteIds.length !== WORKING_SET_NOTE_COUNT) {
    throw new Error("performance fixture requires one hundred notes for the working set");
  }
  return { noteIds, measuredNoteIds, workingSetNoteIds };
}

function plainFixture(projection: TreeProjection, blockCount: number): PerformanceFixture {
  const { noteIds, measuredNoteIds, workingSetNoteIds } = selectNoteIds(projection);
  const measured = new Map(measuredNoteIds.map((id, index) => [id, index]));
  const documents: WorkspaceDocument[] = noteIds.map((noteId) => {
    const measuredIndex = measured.get(noteId);
    return {
      noteId,
      documentJson:
        measuredIndex === undefined ? emptyDocument() : plainDocument(blockCount, measuredIndex),
      markdown: "",
      revision: 1,
      wordCount: measuredIndex === undefined ? 0 : blockCount * 10,
    };
  });
  const tags = createTags();
  const people = createPeople();
  const references = plainReferences(noteIds, tags, people);
  return {
    snapshot: {
      protocolVersion: 1,
      activeNoteId: measuredNoteIds[0] ?? null,
      nodes: projectionNodes(projection),
      documents,
      historyHeaders: [],
      settings,
      tags: [...tags],
      people: [...people],
      references: references.map((entry) => ({
        noteId: entry.noteId,
        targets: [...entry.targets],
      })),
    },
    references: { tags, people, references },
    searchHits: new Map(),
    identity: {
      name: projection.metadata.name,
      operationsDigest: projection.operationsDigest,
      nodeCount: projection.metadata.nodeCount,
      noteCount: projection.metadata.noteCount,
      folderCount: projection.metadata.folderCount,
      blockCount,
      content: "plain",
      contentVersion: FIXTURE_CONTENT_VERSIONS.plain,
      journalEntryCount: 0,
      historyHeaderCount: 0,
      annotationCount: 0,
      taskCount: 0,
      averageDocumentJsonBytes: null,
      largestTagFanOut: 1,
      measuredNoteIds,
      workingSetNoteIds,
    },
  };
}

function variedFixture(projection: TreeProjection, blockCount: number): PerformanceFixture {
  const { noteIds, measuredNoteIds, workingSetNoteIds } = selectNoteIds(projection);
  const tags = createTags();
  const people = createPeople();
  const titles = new Map(projection.nodes.map((node) => [node.id, node.title]));
  const contentReferences: ContentReferences = {
    tags,
    people,
    notes: noteIds.map((id) => ({ id, title: titles.get(id) ?? id })),
  };
  const measured = new Map(measuredNoteIds.map((id, index) => [id, index]));
  const documents: WorkspaceDocument[] = [];
  const references: NoteReferences[] = [];
  const headers: HistoryHeader[] = [];
  const annotations: WorkspaceAnnotation[] = [];
  const tasks: WorkspaceTask[] = [];
  const properties: NoteProperty[] = [];
  const searchHits = new Map<string, SearchHit[]>();
  const tagFanOut = new Map<string, number>();
  let documentJsonBytes = 0;

  function addDocument(noteId: string, index: number, generated: GeneratedDocument): void {
    documents.push({
      noteId,
      documentJson: generated.json,
      markdown: "",
      revision: 1,
      wordCount: generated.wordCount,
    });
    documentJsonBytes += JSON.stringify(generated.json).length;
    references.push(generatedReferences(noteId, generated));
    headers.push(...historyHeaders(noteId, index, generated.wordCount));
    annotations.push(...generated.annotations);
    tasks.push(...generated.tasks);
    for (const tagId of generated.tagIds) {
      tagFanOut.set(tagId, (tagFanOut.get(tagId) ?? 0) + 1);
    }
    const title = titles.get(noteId) ?? noteId;
    for (const targetId of [...generated.mentionedNoteIds, ...generated.linkedNoteIds]) {
      addSearchHit(searchHits, titles.get(targetId) ?? targetId, {
        noteId,
        title,
        snippet: generated.text.slice(0, 120),
        score: 1,
      });
    }
  }

  noteIds.forEach((noteId, index) => {
    const measuredIndex = measured.get(noteId);
    addDocument(
      noteId,
      index,
      measuredIndex === undefined
        ? ordinaryDocument(noteId, index, contentReferences)
        : measuredDocument(noteId, index, measuredIndex, blockCount, contentReferences),
    );
    addSearchHit(searchHits, titles.get(noteId) ?? noteId, {
      noteId,
      title: titles.get(noteId) ?? noteId,
      snippet: titles.get(noteId) ?? noteId,
      score: 10,
    });
  });

  const nodes = projectionNodes(projection);
  const journalRank = (nodes.length + 1) * 1024;
  nodes.push({
    id: JOURNAL_ROOT_ID,
    kind: "folder",
    parentId: null,
    rank: journalRank,
    title: JOURNAL_ROOT_TITLE,
    icon: null,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    deletedAt: null,
    pinnedAt: null,
  });
  for (let entry = 0; entry < JOURNAL_ENTRY_COUNT; entry += 1) {
    const noteId = `performance-journal-${entry.toString().padStart(4, "0")}`;
    nodes.push({
      id: noteId,
      kind: "note",
      parentId: JOURNAL_ROOT_ID,
      rank: (entry + 1) * 1024,
      title: "Untitled",
      icon: null,
      createdAt: FIXTURE_TIME - entry * DAY_MS,
      updatedAt: FIXTURE_TIME - entry * DAY_MS,
      deletedAt: null,
      pinnedAt: null,
    });
    addDocument(noteId, entry, journalDocument(noteId, entry, contentReferences));
    properties.push(...journalProperties(noteId, entry));
  }

  return {
    snapshot: {
      protocolVersion: 1,
      activeNoteId: measuredNoteIds[0] ?? null,
      nodes,
      documents,
      historyHeaders: headers,
      settings,
      tags: [...tags],
      people: [...people],
      references: references.map((entry) => ({
        noteId: entry.noteId,
        targets: [...entry.targets],
      })),
      properties,
      tasks,
      annotations,
    },
    references: { tags, people, references },
    searchHits: sortedSearchHits(searchHits),
    identity: {
      name: projection.metadata.name,
      operationsDigest: projection.operationsDigest,
      nodeCount: projection.metadata.nodeCount,
      noteCount: projection.metadata.noteCount,
      folderCount: projection.metadata.folderCount,
      blockCount,
      content: "varied",
      contentVersion: FIXTURE_CONTENT_VERSIONS.varied,
      journalEntryCount: JOURNAL_ENTRY_COUNT,
      historyHeaderCount: headers.length,
      annotationCount: annotations.length,
      taskCount: tasks.length,
      averageDocumentJsonBytes: Math.round(documentJsonBytes / documents.length),
      largestTagFanOut: Math.max(0, ...tagFanOut.values()),
      measuredNoteIds,
      workingSetNoteIds,
    },
  };
}

/**
 * @name createPerformanceSnapshot
 * @description Builds the workspace snapshot, reference bootstrap and search answers for one
 * fixture. `plain` reproduces content version 1 (uniform paragraphs in the eight measured notes,
 * empty other notes); `varied` is content version 2 with realistic structure in every note,
 * history headers, annotations, tasks and a journal.
 * @example
 * const fixture = createPerformanceSnapshot(projection, 500, "varied");
 */
export function createPerformanceSnapshot(
  projection: TreeProjection,
  blockCount: number,
  content: FixtureContent,
): PerformanceFixture {
  return content === "plain"
    ? plainFixture(projection, blockCount)
    : variedFixture(projection, blockCount);
}
