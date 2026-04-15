import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { PERSISTED_STORE_NAMES } from "@/core/shared/persistence-types";

let canUseRemote = false;
let remoteUserId: string | null = null;
let listRemoteRecordsImpl = async (_storeName: string) => [] as unknown[];
let getRemoteRecordImpl = async (_storeName: string, _id: string) => undefined as unknown;
let putRemoteRecordCalls: Array<{ storeName: string; record: unknown; userId?: string }> = [];
let softDeleteRemoteRecordCalls: Array<{ storeName: string; id: string; userId?: string }> = [];
let softDeleteRemoteRecordsCalls: Array<{ storeName: string; ids: string[]; userId?: string }> = [];

const supabaseModuleMock = {
  canUseRemotePersistence: () => canUseRemote,
  deleteRecordFromRemote: async () => {},
  getLastSyncTime: () => null,
  getRemotePersistenceUserId: () => remoteUserId,
  getRemoteRecord: (storeName: string, id: string, _userId?: string) =>
    getRemoteRecordImpl(storeName, id),
  getStoredRememberMePreference: () => false,
  getSupabaseClient: () => undefined,
  isSupabaseConfigured: () => true,
  listRemoteRecords: (storeName: string) => listRemoteRecordsImpl(storeName),
  pullAllFromRemote: async () => {},
  putRemoteRecord: async (storeName: string, record: unknown, userId?: string) => {
    putRemoteRecordCalls.push({ storeName, record, userId });
  },
  pushAllToRemote: async () => {},
  pushRecordToRemote: async () => {},
  softDeleteRemoteRecord: async (storeName: string, id: string, userId?: string) => {
    softDeleteRemoteRecordCalls.push({ storeName, id, userId });
  },
  softDeleteRemoteRecords: async (storeName: string, ids: string[], userId?: string) => {
    softDeleteRemoteRecordsCalls.push({ storeName, ids, userId });
  },
  setSupabaseSessionPersistence: async () => {},
  SUPABASE_AUTH_STORAGE_KEY: "supabase.auth.token",
};

mock.restore();
mock.module("@/core/persistence/supabase", () => supabaseModuleMock);
mock.module("@/core/persistence/supabase/index", () => supabaseModuleMock);
mock.module("../workspace-target", () => ({
  getWorkspaceTarget: () =>
    canUseRemote && remoteUserId
      ? {
          kind: "cloud" as const,
          workspaceId: remoteUserId,
          userId: remoteUserId,
        }
      : {
          kind: "local" as const,
          workspaceId: "guest-local",
        },
  isCloudWorkspaceTarget: (
    target: { kind: "local" | "cloud" },
  ): target is { kind: "cloud"; workspaceId: string; userId: string } => target.kind === "cloud",
}));

const repositoriesPromise = import("../index");

beforeEach(() => {
  canUseRemote = false;
  remoteUserId = null;
  listRemoteRecordsImpl = async () => [];
  getRemoteRecordImpl = async () => undefined;
  putRemoteRecordCalls = [];
  softDeleteRemoteRecordCalls = [];
  softDeleteRemoteRecordsCalls = [];
});

afterEach(() => {
  mock.restore();
});

describe("repository remote routing", () => {
  test("notesRepository.list prefers Supabase when remote persistence is available", async () => {
    const { notesRepository } = await repositoriesPromise;

    canUseRemote = true;
    remoteUserId = "user-123";
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
  });

  test("foldersRepository.destroy soft-deletes descendant folders and notes in Supabase mode", async () => {
    const { foldersRepository } = await repositoriesPromise;

    canUseRemote = true;
    remoteUserId = "user-123";
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
        userId: "user-123",
      },
      {
        storeName: PERSISTED_STORE_NAMES.notes,
        ids: ["note-1"],
        userId: "user-123",
      },
    ]);
  });

  test("journalRepository.destroyTag removes tag references before soft-deleting the tag in Supabase mode", async () => {
    const { journalRepository } = await repositoriesPromise;

    canUseRemote = true;
    remoteUserId = "user-123";
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
    expect(putRemoteRecordCalls[0]?.userId).toBe("user-123");
    expect(softDeleteRemoteRecordCalls).toEqual([
      { storeName: PERSISTED_STORE_NAMES.tags, id: "tag-1", userId: "user-123" },
    ]);
  });
});
