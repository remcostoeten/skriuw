import type {
  MobileFolder,
  MobileJournalEntry,
  MobileNote,
  MobileWorkspace,
} from "./workspace-types";

function iso(day: string) {
  return `${day}T09:00:00.000Z`;
}

export function buildStarterFolders(): MobileFolder[] {
  return [
    {
      id: "mobile-folder-daily",
      name: "Daily Notes",
      parentId: null,
      createdAt: iso("2026-04-07"),
      updatedAt: iso("2026-04-07"),
    },
    {
      id: "mobile-folder-playground",
      name: "Playground",
      parentId: null,
      createdAt: iso("2026-04-08"),
      updatedAt: iso("2026-04-08"),
    },
  ];
}

export function buildStarterNotes(): MobileNote[] {
  return [
    {
      id: "mobile-note-welcome",
      name: "Welcome.md",
      content: `# Welcome to Skriuw mobile

This is your local guest workspace on this device.

- Capture notes without signing in.
- Browse and edit your journal on the go.
- When cloud auth is wired, this profile tab becomes the bridge to your private workspace.`,
      parentId: null,
      createdAt: iso("2026-04-07"),
      updatedAt: iso("2026-04-07"),
    },
    {
      id: "mobile-note-sprint-review",
      name: "Sprint Review.md",
      content: `# Sprint Review

- Mobile scaffold now lives beside the web app
- Guest workspace is persisted locally
- Notes and journal use the same product model as the web app`,
      parentId: "mobile-folder-daily",
      createdAt: iso("2026-04-10"),
      updatedAt: iso("2026-04-10"),
    },
    {
      id: "mobile-note-scratchpad",
      name: "Scratchpad.md",
      content: `# Scratchpad

Use this note to test quick edits, meeting notes, and rough ideas.`,
      parentId: "mobile-folder-playground",
      createdAt: iso("2026-04-11"),
      updatedAt: iso("2026-04-11"),
    },
  ];
}

export function buildStarterJournalEntries(): MobileJournalEntry[] {
  return [
    {
      id: "mobile-entry-2026-04-12",
      dateKey: "2026-04-12",
      content: `Wrapped the first mobile guest pass.

The app feels much more real once notes, journal, and profile all exist in one flow.`,
      mood: "great",
      tags: ["mobile", "guest"],
      createdAt: iso("2026-04-12"),
      updatedAt: iso("2026-04-12"),
    },
    {
      id: "mobile-entry-2026-04-13",
      dateKey: "2026-04-13",
      content: `Next up is cloud auth and syncing against the same user-scoped backend contract as web.`,
      mood: "good",
      tags: ["roadmap"],
      createdAt: iso("2026-04-13"),
      updatedAt: iso("2026-04-13"),
    },
  ];
}

export function buildStarterWorkspace(): MobileWorkspace {
  return {
    folders: buildStarterFolders(),
    notes: buildStarterNotes(),
    journalEntries: buildStarterJournalEntries(),
  };
}
