import type {
  TaskPriority,
  TaskStatus,
  WorkspaceDocument,
  WorkspaceNode,
  WorkspaceSnapshot,
  WorkspaceTask,
} from "@skriuw/renderer-core/contracts/workspace";
import { shiftDay, todayKey } from "@skriuw/renderer-core/journal/dates";
import { countWords, productSchema, serializeProductMarkdown } from "../src/features/editor/schema";
import { createWorkflowSnapshot } from "./fixture";

type ShowcaseTask = {
  id: string;
  title: string;
  offset: number | null;
  done?: boolean;
  status?: TaskStatus;
  priority?: TaskPriority;
  recurrence?: string;
  description?: string;
  tagIds?: string[];
  subtasks?: { title: string; done: boolean }[];
};

type ShowcaseNote = {
  id: string;
  title: string;
  parentId: string | null;
  heading: string;
  tasks: ShowcaseTask[];
};

const HOUR = 60 * 60 * 1000;

const NOTES: ShowcaseNote[] = [
  {
    id: "note-weekly-review",
    title: "Weekly review",
    parentId: "folder-a",
    heading: "This week",
    tasks: [
      {
        id: "task-summary",
        title: "Draft the quarterly summary",
        offset: -3,
        priority: "high",
        description: "Pull the numbers from the dashboard first.",
      },
      {
        id: "task-pull-requests",
        title: "Review open pull requests",
        offset: 0,
        status: "in_progress",
        recurrence: "every week",
        subtasks: [
          { title: "Sync service", done: true },
          { title: "Mobile shell", done: false },
        ],
      },
      { id: "task-team-update", title: "Send the team update", offset: 0, done: true },
      { id: "task-sprint", title: "Plan the next sprint", offset: 2, tagIds: ["tag-ideas"] },
    ],
  },
  {
    id: "note-mobile-release",
    title: "Mobile release",
    parentId: "folder-a",
    heading: "Before the build",
    tasks: [
      {
        id: "task-back-gesture",
        title: "Fix the Android back gesture",
        offset: -1,
        priority: "urgent",
      },
      {
        id: "task-screenshots",
        title: "Update the store screenshots",
        offset: 4,
        tagIds: ["tag-research", "tag-ideas"],
      },
      {
        id: "task-release-notes",
        title: "Write the release notes",
        offset: null,
        description: "Mention the new quick actions.",
      },
      { id: "task-sdk", title: "Bump the SDK version", offset: -2, done: true },
    ],
  },
  {
    id: "note-inbox",
    title: "Inbox",
    parentId: null,
    heading: "Loose ends",
    tasks: [
      { id: "task-dentist", title: "Call the dentist", offset: 1 },
      { id: "task-passport", title: "Renew the passport", offset: 12 },
      { id: "task-reading", title: "Read the sync design notes", offset: null },
      { id: "task-electricity", title: "Pay the electricity bill", offset: null, done: true },
      { id: "task-train", title: "Book train tickets", offset: -5, done: true },
    ],
  },
];

function dueDate(offset: number | null): string | null {
  return offset === null ? null : shiftDay(todayKey(), offset);
}

function checkItem(entry: ShowcaseTask) {
  return {
    type: "check_item",
    attrs: {
      checked: entry.done === true,
      taskId: entry.id,
      blockId: `${entry.id}-block`,
      dueDate: dueDate(entry.offset),
      recurrence: entry.recurrence ?? null,
    },
    content: [
      { type: "paragraph", content: [{ type: "text", text: entry.title }] },
      ...(entry.subtasks
        ? [
            {
              type: "check_list",
              content: entry.subtasks.map((subtask) => ({
                type: "check_item",
                attrs: {
                  checked: subtask.done,
                  taskId: null,
                  blockId: null,
                  dueDate: null,
                  recurrence: null,
                },
                content: [{ type: "paragraph", content: [{ type: "text", text: subtask.title }] }],
              })),
            },
          ]
        : []),
    ],
  };
}

function noteDocument(note: ShowcaseNote): WorkspaceDocument {
  const documentJson = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: note.heading }] },
      { type: "check_list", content: note.tasks.map(checkItem) },
      { type: "paragraph", content: [{ type: "text", text: "Anything else goes below." }] },
    ],
  };
  const document = productSchema.nodeFromJSON(documentJson);
  return {
    noteId: note.id,
    documentJson,
    markdown: serializeProductMarkdown(document),
    revision: 1,
    wordCount: countWords(document),
  };
}

function noteNode(note: ShowcaseNote, rank: number, now: number): WorkspaceNode {
  return {
    id: note.id,
    kind: "note",
    title: note.title,
    parentId: note.parentId,
    rank,
    icon: null,
    createdAt: now - 72 * HOUR,
    updatedAt: now - HOUR,
    deletedAt: null,
    pinnedAt: null,
  };
}

function task(
  entry: ShowcaseTask,
  noteId: string | null,
  index: number,
  now: number,
): WorkspaceTask {
  return {
    id: entry.id,
    title: entry.title,
    status: entry.done ? "done" : (entry.status ?? "todo"),
    priority: entry.priority ?? "medium",
    dueDate: dueDate(entry.offset),
    description: entry.description ?? "",
    tagIds: entry.tagIds ?? [],
    assigneeIds: [],
    source: noteId === null ? null : { noteId, blockId: `${entry.id}-block` },
    detachedAt: noteId === null ? now - 30 * HOUR : null,
    createdAt: now - (96 - index) * HOUR,
    updatedAt: entry.done ? now - index * HOUR : now - 48 * HOUR,
  };
}

export function createTaskShowcaseSnapshot(): WorkspaceSnapshot {
  const base = createWorkflowSnapshot();
  const now = Date.now();
  const tasks = NOTES.flatMap((note) =>
    note.tasks.map((entry, index) => task(entry, note.id, index, now)),
  );
  tasks.push(
    task({ id: "task-cards", title: "Order new business cards", offset: 6 }, null, 0, now),
  );
  return {
    ...base,
    nodes: [...base.nodes, ...NOTES.map((note, index) => noteNode(note, 4096 + index * 1024, now))],
    documents: [...base.documents, ...NOTES.map(noteDocument)],
    tasks,
  };
}
