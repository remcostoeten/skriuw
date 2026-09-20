import {
  WORKSPACE_PROTOCOL_VERSION,
  type NoteProperty,
  type WorkspaceDocument,
  type WorkspaceNode,
  type WorkspaceSettings,
  type WorkspaceSnapshot,
} from "../../../../../shared/renderer-core/src/contracts/workspace";
import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_MOOD_PROPERTY_ID,
  JOURNAL_ROOT_ID,
  JOURNAL_ROOT_TITLE,
} from "../../../../../shared/renderer-core/src/journal/constants";
import { MOOD_PROPERTY_OPTIONS, type MoodLevel } from "../model";

/**
 * The fixture the calendar, the mood trend and "On this day" are held to. It
 * is read by the mobile projections here and by the desktop ones in
 * `app/src/features/journal`; both have to agree on it, which is what
 * "matches desktop for the fixture" means.
 *
 * The day the fixture is written from. Fixed, so the trend window, the
 * anniversaries and the streak never move with the wall clock.
 */
export const FIXTURE_TODAY = "2026-09-20";

export type FixtureEntry = {
  dateKey: string;
  mood: MoodLevel | null;
  body: string;
};

/**
 * Chosen to exercise every rule in `docs/specs/journal-daily.md`: rated and
 * unrated days inside the thirty-day window, a day with a mood and no words,
 * a day with words and no mood, a written day that predates the window, and
 * the four anniversaries a day can recall.
 */
export const FIXTURE_ENTRIES: readonly FixtureEntry[] = [
  { dateKey: "2026-09-20", mood: "good", body: "Shipped the capture queue." },
  { dateKey: "2026-09-19", mood: "great", body: "Long walk, clear head." },
  { dateKey: "2026-09-18", mood: null, body: "Notes from the review." },
  { dateKey: "2026-09-17", mood: "good", body: "Quiet." },
  { dateKey: "2026-09-16", mood: "neutral", body: "Errands." },
  { dateKey: "2026-09-13", mood: "low", body: "A week ago today, slow going." },
  { dateKey: "2026-09-09", mood: "rough", body: "Stuck on the bridge adapter." },
  { dateKey: "2026-09-05", mood: "low", body: "Better, but tired." },
  { dateKey: "2026-09-02", mood: "neutral", body: "Planning." },
  { dateKey: "2026-08-25", mood: "great", body: "Outside all day." },
  { dateKey: "2026-08-20", mood: "good", body: "A month ago today." },
  { dateKey: "2026-06-01", mood: "rough", body: "Well outside the window." },
  { dateKey: "2025-09-20", mood: "neutral", body: "A year ago today." },
  { dateKey: "2024-09-20", mood: "great", body: "Two years ago today." },
  { dateKey: "2026-09-12", mood: "good", body: "" },
];

/** An opened but never written day: no words, no mood, so nothing surfaces it. */
export const FIXTURE_EMPTY_DAY = "2026-09-15";

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

export function fixtureNoteId(dateKey: string): string {
  return `journal-${dateKey}`;
}

function node(id: string, kind: WorkspaceNode["kind"], parentId: string | null, title: string, rank: number): WorkspaceNode {
  return {
    id,
    kind,
    parentId,
    rank,
    title,
    icon: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    deletedAt: null,
    pinnedAt: null,
  };
}

function document(noteId: string, body: string): WorkspaceDocument {
  return {
    noteId,
    documentJson: {
      type: "doc",
      content: body.length === 0 ? [{ type: "paragraph" }] : [
        { type: "paragraph", content: [{ type: "text", text: body }] },
      ],
    },
    markdown: body.length === 0 ? "" : `${body}\n`,
    revision: 1,
    wordCount: body.split(/\s+/).filter((word) => word.length > 0).length,
  };
}

function dateProperty(noteId: string, dateKey: string): NoteProperty {
  return {
    noteId,
    id: JOURNAL_DATE_PROPERTY_ID,
    name: "Date",
    value: { valueVersion: 1, type: "date", value: dateKey },
    options: [],
    position: 0,
  };
}

function moodProperty(noteId: string, mood: MoodLevel): NoteProperty {
  return {
    noteId,
    id: JOURNAL_MOOD_PROPERTY_ID,
    name: "Mood",
    value: { valueVersion: 1, type: "select", value: mood },
    options: MOOD_PROPERTY_OPTIONS.map((option) => ({ ...option })),
    position: 1,
  };
}

export function journalSnapshot(): WorkspaceSnapshot {
  const nodes: WorkspaceNode[] = [node(JOURNAL_ROOT_ID, "folder", null, JOURNAL_ROOT_TITLE, 1024)];
  const documents: WorkspaceDocument[] = [];
  const properties: NoteProperty[] = [];
  const days = [
    ...FIXTURE_ENTRIES,
    { dateKey: FIXTURE_EMPTY_DAY, mood: null, body: "" } satisfies FixtureEntry,
  ];

  days.forEach((entry, index) => {
    const noteId = fixtureNoteId(entry.dateKey);
    nodes.push(node(noteId, "note", JOURNAL_ROOT_ID, "Untitled", (index + 2) * 1024));
    documents.push(document(noteId, entry.body));
    properties.push(dateProperty(noteId, entry.dateKey));
    if (entry.mood !== null) {
      properties.push(moodProperty(noteId, entry.mood));
    }
  });

  return {
    protocolVersion: WORKSPACE_PROTOCOL_VERSION,
    activeNoteId: null,
    nodes,
    documents,
    historyHeaders: [],
    settings: SETTINGS,
    tags: [],
    people: [],
    references: [],
    properties,
  };
}
