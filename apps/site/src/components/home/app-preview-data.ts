export type View = "notes" | "journal" | "tasks" | "tags" | "people";

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "item"; text: string; done: boolean };

export type OutlineItem = Extract<Block, { kind: "heading" }>;

export type Note = {
  id: string;
  label: string;
  words: number;
  updated: string;
  links: string[];
  blocks: Block[];
};

export type TreeRow =
  | { kind: "folder"; label: string; count: number; open: boolean }
  | { kind: "note"; id: string; depth: number };

export type Mood = "great" | "good" | "okay" | "low" | "rough";

export type JournalEntry = { mood: Mood; blocks: Block[] };

export type Task = { id: string; text: string; note: string; done: boolean; due: string };

export type Revision = { clock: string; relative: string; delta: string };

export type Entity = { name: string; count: number; recent: string[] };

export const railViews: View[] = ["notes", "journal", "tasks", "tags", "people"];

export const viewLabels: Record<View, string> = {
  notes: "Notes",
  journal: "Journal",
  tasks: "Tasks",
  tags: "Tags",
  people: "People",
};

export const welcome: Note = {
  id: "welcome",
  label: "Welcome",
  words: 197,
  updated: "Oct 3, 9:14 AM",
  links: ["linking", "writing", "launch-checklist"],
  blocks: [
    { kind: "heading", level: 1, text: "Welcome" },
    {
      kind: "paragraph",
      text: "This is your workspace. Five notes, three folders, and nothing you have to keep.",
    },
    { kind: "heading", level: 2, text: "Where things are" },
    {
      kind: "paragraph",
      text: "Guides explain the editor. Projects is a worked example. Ideas is somewhere to be untidy.",
    },
    { kind: "heading", level: 2, text: "Start here" },
    {
      kind: "paragraph",
      text: "Press / on an empty line to see what a block can be.",
    },
  ],
};

export const notes: Note[] = [
  welcome,
  {
    id: "linking",
    label: "Linking",
    words: 312,
    updated: "Oct 1, 11:08 AM",
    links: ["welcome", "writing"],
    blocks: [
      { kind: "heading", level: 1, text: "Linking" },
      {
        kind: "paragraph",
        text: "Type @ and pick a note. The link survives renames because it points at the note, not the title.",
      },
      { kind: "heading", level: 2, text: "Tags and people" },
      {
        kind: "paragraph",
        text: "#tags and $people become chips you can search and filter on.",
      },
      { kind: "heading", level: 3, text: "Backlinks" },
      {
        kind: "paragraph",
        text: "Every note lists what points at it in the inspector.",
      },
    ],
  },
  {
    id: "writing",
    label: "Writing",
    words: 528,
    updated: "Sep 30, 4:47 PM",
    links: ["welcome"],
    blocks: [
      { kind: "heading", level: 1, text: "Writing" },
      {
        kind: "paragraph",
        text: "Markdown underneath, a rich editor on top. Type # for a heading or - for a list.",
      },
      { kind: "heading", level: 2, text: "Slash menu" },
      {
        kind: "paragraph",
        text: "Headings, lists, code, tables, and diagrams sit behind one key.",
      },
      { kind: "heading", level: 2, text: "Vim mode" },
      {
        kind: "paragraph",
        text: "Modal editing for people who never want to reach for the mouse.",
      },
    ],
  },
  {
    id: "reading-list",
    label: "Reading list",
    words: 86,
    updated: "Sep 28, 8:02 PM",
    links: [],
    blocks: [
      { kind: "heading", level: 1, text: "Reading list" },
      { kind: "item", text: "Local-first software, Ink & Switch", done: true },
      { kind: "item", text: "The Art of Doing Science and Engineering", done: false },
      { kind: "item", text: "A Pattern Language", done: false },
    ],
  },
  {
    id: "launch-checklist",
    label: "Launch checklist",
    words: 190,
    updated: "Oct 2, 6:02 PM",
    links: ["welcome"],
    blocks: [
      { kind: "heading", level: 1, text: "Launch checklist" },
      {
        kind: "paragraph",
        text: "Everything that has to be true before the tag goes out.",
      },
      { kind: "heading", level: 2, text: "Before" },
      { kind: "item", text: "Changelog written", done: true },
      { kind: "item", text: "Installers smoke-tested", done: false },
      { kind: "heading", level: 2, text: "After" },
      { kind: "item", text: "Watch the crash reports", done: false },
    ],
  },
];

export const notesById = new Map(notes.map((note) => [note.id, note]));

export const tree: TreeRow[] = [
  { kind: "folder", label: "Guides", count: 2, open: true },
  { kind: "note", id: "linking", depth: 1 },
  { kind: "note", id: "writing", depth: 1 },
  { kind: "folder", label: "Ideas", count: 1, open: true },
  { kind: "note", id: "reading-list", depth: 1 },
  { kind: "folder", label: "Projects", count: 1, open: true },
  { kind: "note", id: "launch-checklist", depth: 1 },
  { kind: "note", id: "welcome", depth: 0 },
];

export const weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export const today = 3;

export const calendar = Array.from({ length: 35 }, (_, index) => {
  const date = index < 3 ? 28 + index : index - 2 <= 31 ? index - 2 : index - 33;
  return { date, muted: index < 3 || index > 33 };
});

export const moods: Mood[] = ["great", "good", "okay", "low", "rough"];

export const moodLabels: Record<Mood, string> = {
  great: "Great",
  good: "Good",
  okay: "Okay",
  low: "Low",
  rough: "Rough",
};

export const moodTone: Record<Mood, string> = {
  great: "bg-emerald-500",
  good: "bg-emerald-400",
  okay: "bg-ink-400",
  low: "bg-amber-500",
  rough: "bg-rose-500",
};

export const journalEntries: Record<number, JournalEntry> = {
  3: {
    mood: "good",
    blocks: [
      { kind: "heading", level: 1, text: "Saturday, October 3" },
      {
        kind: "paragraph",
        text: "Slow morning. Rewrote the hero copy three times and kept the shortest one.",
      },
      {
        kind: "paragraph",
        text: "The preview on the homepage finally looks like the app.",
      },
    ],
  },
  2: {
    mood: "great",
    blocks: [
      { kind: "heading", level: 1, text: "Friday, October 2" },
      {
        kind: "paragraph",
        text: "Shipped due dates for tasks. Overdue, today, and upcoming each get a group.",
      },
    ],
  },
  1: {
    mood: "okay",
    blocks: [
      { kind: "heading", level: 1, text: "Thursday, October 1" },
      {
        kind: "paragraph",
        text: "CI was flaky all afternoon. Sharded the gate and it dropped to four minutes.",
      },
    ],
  },
};

export const emptyEntry: JournalEntry = {
  mood: "okay",
  blocks: [
    { kind: "heading", level: 1, text: "No entry yet" },
    { kind: "paragraph", text: "Start typing and the day fills itself in." },
  ],
};

export const initialTasks: Task[] = [
  {
    id: "t1",
    text: "Smoke-test the Linux installers",
    note: "Launch checklist",
    done: false,
    due: "Today",
  },
  {
    id: "t2",
    text: "Refresh screenshots for the release post",
    note: "Launch checklist",
    done: false,
    due: "Today",
  },
  {
    id: "t3",
    text: "Read A Pattern Language",
    note: "Reading list",
    done: false,
    due: "Mon",
  },
  {
    id: "t4",
    text: "Write the changelog",
    note: "Launch checklist",
    done: true,
    due: "Tue",
  },
];

export const revisions: Revision[] = [
  { clock: "09:14", relative: "1 h ago", delta: "+18" },
  { clock: "08:41", relative: "2 h ago", delta: "+142" },
  { clock: "Fri", relative: "1 d ago", delta: "−6" },
];

export const savedRevision: Revision = { clock: "10:21", relative: "just now", delta: "+11" };

export const tags: Entity[] = [
  { name: "#release", count: 4, recent: ["Launch checklist", "Welcome"] },
  { name: "#reading", count: 3, recent: ["Reading list"] },
  { name: "#editor", count: 2, recent: ["Writing", "Linking"] },
  { name: "#ideas", count: 1, recent: ["Reading list"] },
];

export const people: Entity[] = [
  { name: "$Femke", count: 5, recent: ["Launch checklist", "Welcome"] },
  { name: "$Jelle", count: 2, recent: ["Writing"] },
  { name: "$Sanne", count: 1, recent: ["Reading list"] },
];

export const draftSentence = "Everything here lands in the same frame you type it.";
