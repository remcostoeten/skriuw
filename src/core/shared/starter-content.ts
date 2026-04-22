import type { MoodLevel } from "@/types/journal";

type StarterJournalMetadata = {
  mood?: MoodLevel;
  tags: string[];
  weather?: string;
  location?: string;
};

type StarterFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

type StarterNote = {
  id: string;
  name: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  preferredEditorMode?: "raw" | "block";
  journalMeta?: StarterJournalMetadata;
};

type StarterTag = {
  id: string;
  name: string;
  color: string;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StarterJournalEntry = {
  id: string;
  dateKey: string;
  content: string;
  mood?: MoodLevel;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type StarterContent = {
  folders: StarterFolder[];
  notes: StarterNote[];
  tags: StarterTag[];
  journalEntries: StarterJournalEntry[];
  markerNoteId: string;
};

export type MobileStarterWorkspace = {
  folders: StarterFolder[];
  notes: Array<Omit<StarterNote, "preferredEditorMode" | "journalMeta">>;
  journalEntries: StarterJournalEntry[];
};

function iso(day: string) {
  return `${day}T09:00:00.000Z`;
}

export function buildWebStarterContent(): StarterContent {
  const markerNoteId = "privacy-note-welcome";

  return {
    markerNoteId,
    folders: [
      {
        id: "privacy-folder-daily",
        name: "Daily Notes",
        parentId: null,
        createdAt: iso("2026-04-07"),
        updatedAt: iso("2026-04-07"),
      },
      {
        id: "privacy-folder-playground",
        name: "Playground",
        parentId: null,
        createdAt: iso("2026-04-08"),
        updatedAt: iso("2026-04-08"),
      },
    ],
    notes: [
      {
        id: markerNoteId,
        name: "Welcome.md",
        content: `# Welcome to Skriuw

Your workspace is in sync across all your devices.

- Capture your thoughts instantly with rich formatting.
- Review your journal over time to reflect on your progress.
- Everything is safely backed up to the cloud.
`,
        parentId: null,
        preferredEditorMode: "block",
        createdAt: iso("2026-04-07"),
        updatedAt: iso("2026-04-07"),
      },
      {
        id: "privacy-note-sprint",
        name: "Sprint Review.md",
        content: `# Launch checklist

- Tighten the auth gate copy
- Configure your cloud profile
- Link mobile and web devices
`,
        parentId: "privacy-folder-daily",
        preferredEditorMode: "block",
        createdAt: iso("2026-04-10"),
        updatedAt: iso("2026-04-10"),
      },
      {
        id: "privacy-note-scratchpad",
        name: "Scratchpad.md",
        content: `# Scratchpad

Try drag and drop, metadata edits, journal links, and tag creation here.
`,
        parentId: "privacy-folder-playground",
        preferredEditorMode: "raw",
        journalMeta: {
          mood: "good",
          tags: ["focus"],
          location: "Amsterdam",
        },
        createdAt: iso("2026-04-11"),
        updatedAt: iso("2026-04-11"),
      },
    ],
    tags: [
      {
        id: "privacy-tag-focus",
        name: "focus",
        color: "#3b82f6",
        usageCount: 2,
        lastUsedAt: iso("2026-04-12"),
        createdAt: iso("2026-04-07"),
        updatedAt: iso("2026-04-12"),
      },
      {
        id: "privacy-tag-review",
        name: "review",
        color: "#f97316",
        usageCount: 1,
        lastUsedAt: iso("2026-04-11"),
        createdAt: iso("2026-04-08"),
        updatedAt: iso("2026-04-11"),
      },
    ],
    journalEntries: [
      {
        id: "privacy-entry-2026-04-12",
        dateKey: "2026-04-12",
        content: `Wrapped up integrating the new cloud sync features.

Feeling great about being able to capture ideas and resume on any device.`,
        mood: "great",
        tags: ["focus", "review"],
        createdAt: iso("2026-04-12"),
        updatedAt: iso("2026-04-12"),
      },
    ],
  };
}

export function buildMobileStarterWorkspace(): MobileStarterWorkspace {
  return {
    folders: [
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
    ],
    notes: [
      {
        id: "mobile-note-welcome",
        name: "Welcome.md",
        content: `# Welcome to Skriuw mobile

Your workspace is synced from the cloud.

- Capture notes while on the go.
- Browse and edit your journal from anywhere.
- Your data stays secure in your private cloud account.`,
        parentId: null,
        createdAt: iso("2026-04-07"),
        updatedAt: iso("2026-04-07"),
      },
      {
        id: "mobile-note-sprint-review",
        name: "Sprint Review.md",
        content: `# Sprint Review

- Mobile scaffold now lives beside the web app
- Seamless persistence to the cloud
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
    ],
    journalEntries: [
      {
        id: "mobile-entry-2026-04-12",
        dateKey: "2026-04-12",
        content: `Signed in on mobile for the first time!

The app feels much more real once notes, journal, and profile are all in sync.`,
        mood: "great",
        tags: ["mobile", "launch"],
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
    ],
  };
}
