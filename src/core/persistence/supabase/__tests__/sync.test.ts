import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthSnapshot } from "@/platform/auth";
import { PERSISTED_STORE_NAMES } from "@/core/shared/persistence-types";

let authSnapshot: AuthSnapshot = {
  phase: "guest",
  workspaceMode: "guest",
  rememberMe: true,
  isReady: true,
  isSupabaseConfigured: true,
  user: null,
  session: null,
  error: null,
  workspaceId: "guest-local",
};

let listLocalRecordsCalls = 0;
let upsertCalls: Array<{ table: string; rows: Record<string, unknown>[]; onConflict?: string }> = [];
let updateCalls: Array<{
  table: string;
  payload: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}> = [];

async function loadSyncModule() {
  mock.restore();

  const authModuleMock = {
    getAuthStateSnapshot: () => authSnapshot,
  };

  mock.module("@/platform/auth", () => authModuleMock);
  mock.module("@/platform/auth/index", () => authModuleMock);
  mock.module("@/core/persistence/repositories/local-records", () => ({
    listLocalRecords: async () => {
      listLocalRecordsCalls += 1;
      return [];
    },
  }));
  mock.module("../client", () => ({
    getSupabaseClient: () => ({
      from: (table: string) => ({
        upsert: async (rows: Record<string, unknown>[], options?: { onConflict?: string }) => {
          upsertCalls.push({ table, rows, onConflict: options?.onConflict });
          return { error: null };
        },
        update: (payload: Record<string, unknown>) => ({
          eq: (field: string, value: unknown) => ({
            eq: async (fieldTwo: string, valueTwo: unknown) => {
              updateCalls.push({
                table,
                payload,
                filters: [
                  [field, value],
                  [fieldTwo, valueTwo],
                ],
              });
              return { error: null };
            },
          }),
        }),
      }),
    }),
  }));

  return import(`../sync?test=${Math.random().toString(36).slice(2)}`);
}

beforeEach(() => {
  authSnapshot = {
    phase: "guest",
    workspaceMode: "guest",
    rememberMe: true,
    isReady: true,
    isSupabaseConfigured: true,
    user: null,
    session: null,
    error: null,
    workspaceId: "guest-local",
  };
  listLocalRecordsCalls = 0;
  upsertCalls = [];
  updateCalls = [];
});

afterEach(() => {
  mock.restore();
});

describe("supabase sync gating", () => {
  test("skips full sync when guest mode is active", async () => {
    const syncModule = await loadSyncModule();

    await syncModule.pushAllToRemote();

    expect(listLocalRecordsCalls).toBe(0);
    expect(upsertCalls).toHaveLength(0);
  });

  test("scopes record upserts by user identity when authenticated", async () => {
    const syncModule = await loadSyncModule();

    authSnapshot = {
      ...authSnapshot,
      phase: "authenticated",
      workspaceMode: "cloud",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      },
      workspaceId: "user-123",
    };

    await syncModule.pushRecordToRemote(PERSISTED_STORE_NAMES.notes, {
      id: "note-1",
      name: "Inbox.md",
      content: "# Inbox",
      richContent: { type: "doc", content: [] },
      preferredEditorMode: "block",
      parentId: null,
      createdAt: "2026-03-18T10:00:00.000Z",
      updatedAt: "2026-03-18T10:00:00.000Z",
    });

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toEqual({
      table: "notes",
      onConflict: "user_id,id",
      rows: [
        {
          id: "note-1",
          name: "Inbox.md",
          content: "# Inbox",
          rich_content: { type: "doc", content: [] },
          preferred_editor_mode: "block",
          parent_id: null,
          journal_meta: null,
          created_at: "2026-03-18T10:00:00.000Z",
          updated_at: "2026-03-18T10:00:00.000Z",
          deleted_at: null,
          user_id: "user-123",
        },
      ],
    });
  });

  test("scopes remote deletes by user identity when authenticated", async () => {
    const syncModule = await loadSyncModule();

    authSnapshot = {
      ...authSnapshot,
      phase: "authenticated",
      workspaceMode: "cloud",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      },
      workspaceId: "user-123",
    };

    await syncModule.deleteRecordFromRemote(PERSISTED_STORE_NAMES.notes, "note-1");

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe("notes");
    expect(updateCalls[0].filters).toEqual([
      ["user_id", "user-123"],
      ["id", "note-1"],
    ]);
  });
});
