"use client";

import { markdownToRichDocument } from "@/shared/lib/rich-document";
import {
  PERSISTED_STORE_NAMES,
  type CssColorValue,
  type DateKey,
  type FolderId,
  type IsoTime,
  type JournalEntryId,
  type MarkdownContent,
  type NoteId,
  type PersistedFolder,
  type PersistedJournalEntry,
  type PersistedNote,
  type PersistedTag,
  type TagId,
  type TagName,
} from "@/core/shared/persistence-types";
import { getAuthActorId } from "@/platform/auth";
import { listLocalRecords, putLocalRecord } from "./local-records";

const PRIVACY_DEMO_SEED_VERSION = 1;
const PRIVACY_DEMO_SEED_KEY = `haptic:privacy-demo-seed:v${PRIVACY_DEMO_SEED_VERSION}`;

function getSeedMarkerKey(actorId: string) {
  return `${PRIVACY_DEMO_SEED_KEY}:${actorId}`;
}

function getSeededAt(day: string): IsoTime {
  return `${day}T09:00:00.000Z` as IsoTime;
}

function buildSeedFolders(): PersistedFolder[] {
  return [
    {
      id: "privacy-folder-daily" as FolderId,
      name: "Daily Notes",
      parentId: null,
      createdAt: getSeededAt("2026-04-07"),
      updatedAt: getSeededAt("2026-04-07"),
    },
    {
      id: "privacy-folder-playground" as FolderId,
      name: "Playground",
      parentId: null,
      createdAt: getSeededAt("2026-04-08"),
      updatedAt: getSeededAt("2026-04-08"),
    },
  ];
}

function buildSeedNotes(): PersistedNote[] {
  const welcomeContent = `# Welcome to privacy mode

This workspace stays on this device.

- Create notes instantly without signing in.
- Switch to account mode any time from the profile control.
- Your local edits use the same note and journal UI as the cloud workspace.
`;

  const sprintContent = `# Launch checklist

- Tighten the auth gate copy
- Verify privacy mode routing
- Seed a demo workspace for first-run testing
`;

  const scratchpadContent = `# Scratchpad

Try drag and drop, metadata edits, journal links, and tag creation here.
`;

  return [
    {
      id: "privacy-note-welcome" as NoteId,
      name: "Welcome.md",
      content: welcomeContent as MarkdownContent,
      richContent: markdownToRichDocument(welcomeContent),
      preferredEditorMode: "block",
      parentId: null,
      createdAt: getSeededAt("2026-04-07"),
      updatedAt: getSeededAt("2026-04-07"),
    },
    {
      id: "privacy-note-sprint" as NoteId,
      name: "Sprint Review.md",
      content: sprintContent as MarkdownContent,
      richContent: markdownToRichDocument(sprintContent),
      preferredEditorMode: "block",
      parentId: "privacy-folder-daily" as FolderId,
      createdAt: getSeededAt("2026-04-10"),
      updatedAt: getSeededAt("2026-04-10"),
    },
    {
      id: "privacy-note-scratchpad" as NoteId,
      name: "Scratchpad.md",
      content: scratchpadContent as MarkdownContent,
      richContent: markdownToRichDocument(scratchpadContent),
      preferredEditorMode: "raw",
      parentId: "privacy-folder-playground" as FolderId,
      createdAt: getSeededAt("2026-04-11"),
      updatedAt: getSeededAt("2026-04-11"),
      journalMeta: {
        mood: "good",
        tags: ["focus"] as TagName[],
        location: "Amsterdam",
      },
    },
  ];
}

function buildSeedTags(): PersistedTag[] {
  return [
    {
      id: "privacy-tag-focus" as TagId,
      name: "focus" as TagName,
      color: "#3b82f6" as CssColorValue,
      usageCount: 2,
      lastUsedAt: getSeededAt("2026-04-12"),
      createdAt: getSeededAt("2026-04-07"),
      updatedAt: getSeededAt("2026-04-12"),
    },
    {
      id: "privacy-tag-review" as TagId,
      name: "review" as TagName,
      color: "#f97316" as CssColorValue,
      usageCount: 1,
      lastUsedAt: getSeededAt("2026-04-11"),
      createdAt: getSeededAt("2026-04-08"),
      updatedAt: getSeededAt("2026-04-11"),
    },
  ];
}

function buildSeedJournalEntries(): PersistedJournalEntry[] {
  const content = `Wrapped the privacy-mode pass.

Feeling better about first-run UX now that the shell can open without an account.`;

  return [
    {
      id: "privacy-entry-2026-04-12" as JournalEntryId,
      dateKey: "2026-04-12" as DateKey,
      content: content as MarkdownContent,
      mood: "great",
      tags: ["focus", "review"] as TagName[],
      createdAt: getSeededAt("2026-04-12"),
      updatedAt: getSeededAt("2026-04-12"),
    },
  ];
}

export async function ensurePrivacyDemoSeeded(actorId = getAuthActorId()): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const markerKey = getSeedMarkerKey(actorId);

  if (window.localStorage.getItem(markerKey) === "1") {
    return;
  }

  const [notes, folders, entries, tags] = await Promise.all([
    listLocalRecords(PERSISTED_STORE_NAMES.notes),
    listLocalRecords(PERSISTED_STORE_NAMES.folders),
    listLocalRecords(PERSISTED_STORE_NAMES.journalEntries),
    listLocalRecords(PERSISTED_STORE_NAMES.tags),
  ]);

  if (notes.length > 0 || folders.length > 0 || entries.length > 0 || tags.length > 0) {
    window.localStorage.setItem(markerKey, "1");
    return;
  }

  await Promise.all([
    ...buildSeedFolders().map((folder) => putLocalRecord(PERSISTED_STORE_NAMES.folders, folder)),
    ...buildSeedNotes().map((note) => putLocalRecord(PERSISTED_STORE_NAMES.notes, note)),
    ...buildSeedTags().map((tag) => putLocalRecord(PERSISTED_STORE_NAMES.tags, tag)),
    ...buildSeedJournalEntries().map((entry) =>
      putLocalRecord(PERSISTED_STORE_NAMES.journalEntries, entry),
    ),
  ]);

  window.localStorage.setItem(markerKey, "1");
}
