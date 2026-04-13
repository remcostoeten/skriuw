import { beforeEach, describe, expect, mock, test } from "bun:test";
import { PERSISTED_STORE_NAMES } from "@/core/shared/persistence-types";

let canUseRemote = false;
let listRemoteRecordsImpl = async (_storeName: string) => [] as unknown[];
let getRemoteRecordImpl = async (_storeName: string, _id: string) => undefined as unknown;
let putRemoteRecordCalls: Array<{ storeName: string; record: unknown }> = [];
let softDeleteRemoteRecordCalls: Array<{ storeName: string; id: string }> = [];
let softDeleteRemoteRecordsCalls: Array<{ storeName: string; ids: string[] }> = [];
let resolveLocalPersistenceBackendCalls = 0;

mock.module("@/core/persistence/supabase", () => ({
  canUseRemotePersistence: () => canUseRemote,
  listRemoteRecords: (storeName: string) => listRemoteRecordsImpl(storeName),
  getRemoteRecord: (storeName: string, id: string) => getRemoteRecordImpl(storeName, id),
  putRemoteRecord: async (storeName: string, record: unknown) => {
    putRemoteRecordCalls.push({ storeName, record });
  },
  softDeleteRemoteRecord: async (storeName: string, id: string) => {
    softDeleteRemoteRecordCalls.push({ storeName, id });
  },
  softDeleteRemoteRecords: async (storeName: string, ids: string[]) => {
    softDeleteRemoteRecordsCalls.push({ storeName, ids });
  },
  pushRecordToRemote: async () => {},
  deleteRecordFromRemote: async () => {},
}));

mock.module("@/core/persistence/pglite/records", () => ({
  destroyPGliteRecord: async () => {},
  getPGliteRecord: async () => undefined,
  listPGliteRecords: async () => [],
  putPGliteRecord: async () => {},
}));

mock.module("../local-backend", () => ({
  resolveLocalPersistenceBackend: async () => {
    resolveLocalPersistenceBackendCalls += 1;
    return "pglite";
  },
}));

const notesRepositoryPromise = import("../notes-repository");
const foldersRepositoryPromise = import("../folders-repository");
const journalRepositoryPromise = import("../journal-repository");

beforeEach(() => {
  canUseRemote = false;
  listRemoteRecordsImpl = async () => [];
  getRemoteRecordImpl = async () => undefined;
  putRemoteRecordCalls = [];
  softDeleteRemoteRecordCalls = [];
  softDeleteRemoteRecordsCalls = [];
  resolveLocalPersistenceBackendCalls = 0;
});

describe("repository remote routing", () => {
  test("notesRepository.list prefers Supabase when remote persistence is available", async () => {
    const { notesRepository } = await notesRepositoryPromise;

    canUseRemote = true;
    listRemoteRecordsImpl = async (storeName: string) => {
      expect(storeName).toBe(PERSISTED_STORE_NAMES.notes);
      return [
        {
          id: "note-1",
          name: "Inbox.md",
          content: "# Inbox",
          richContent: { type: "doc", content: [] },
          preferredEditorMode: "block",
          parentId: null,
          createdAt: "2026-04-12T10:00:00.000Z",
          updatedAt: "2026-04-12T10:00:00.000Z",
        },
      ];
    };

    const notes = await notesRepository.list();

    expect(notes).toHaveLength(1);
    expect(notes[0]?.name).toBe("Inbox.md");
    expect(resolveLocalPersistenceBackendCalls).toBe(0);
  });

  test("foldersRepository.destroy soft-deletes descendant folders and notes in Supabase mode", async () => {
    const { foldersRepository } = await foldersRepositoryPromise;

    canUseRemote = true;
    listRemoteRecordsImpl = async (storeName: string) => {
      if (storeName === PERSISTED_STORE_NAMES.folders) {
        return [
          {
            id: "folder-root",
            name: "Root",
            parentId: null,
            createdAt: "2026-04-12T10:00:00.000Z",
            updatedAt: "2026-04-12T10:00:00.000Z",
          },
          {
            id: "folder-child",
            name: "Child",
            parentId: "folder-root",
            createdAt: "2026-04-12T10:00:00.000Z",
            updatedAt: "2026-04-12T10:00:00.000Z",
          },
        ];
      }

      if (storeName === PERSISTED_STORE_NAMES.notes) {
        return [
          {
            id: "note-1",
            name: "Inbox.md",
            content: "# Inbox",
            richContent: { type: "doc", content: [] },
            preferredEditorMode: "block",
            parentId: "folder-child",
            createdAt: "2026-04-12T10:00:00.000Z",
            updatedAt: "2026-04-12T10:00:00.000Z",
          },
        ];
      }

      return [];
    };

    await foldersRepository.destroy("folder-root" as never);

    expect(softDeleteRemoteRecordsCalls).toEqual([
      {
        storeName: PERSISTED_STORE_NAMES.folders,
        ids: ["folder-root", "folder-child"],
      },
      {
        storeName: PERSISTED_STORE_NAMES.notes,
        ids: ["note-1"],
      },
    ]);
    expect(resolveLocalPersistenceBackendCalls).toBe(0);
  });

  test("journalRepository.destroyTag removes tag references before soft-deleting the tag in Supabase mode", async () => {
    const { journalRepository } = await journalRepositoryPromise;

    canUseRemote = true;
    listRemoteRecordsImpl = async (storeName: string) => {
      if (storeName === PERSISTED_STORE_NAMES.tags) {
        return [
          {
            id: "tag-1",
            name: "focus",
            color: "#123456",
            usageCount: 2,
            lastUsedAt: null,
            createdAt: "2026-04-12T10:00:00.000Z",
            updatedAt: "2026-04-12T10:00:00.000Z",
          },
        ];
      }

      if (storeName === PERSISTED_STORE_NAMES.journalEntries) {
        return [
          {
            id: "entry-1",
            dateKey: "2026-04-12",
            content: "Today",
            tags: ["focus", "work"],
            mood: "good",
            createdAt: "2026-04-12T10:00:00.000Z",
            updatedAt: "2026-04-12T10:00:00.000Z",
          },
        ];
      }

      return [];
    };

    await journalRepository.destroyTag("tag-1" as never);

    expect(putRemoteRecordCalls).toHaveLength(1);
    expect(putRemoteRecordCalls[0]?.storeName).toBe(PERSISTED_STORE_NAMES.journalEntries);
    expect(putRemoteRecordCalls[0]?.record).toEqual(
      expect.objectContaining({
        id: "entry-1",
        tags: ["work"],
      }),
    );
    expect(softDeleteRemoteRecordCalls).toEqual([
      { storeName: PERSISTED_STORE_NAMES.tags, id: "tag-1" },
    ]);
    expect(resolveLocalPersistenceBackendCalls).toBe(0);
  });
});
