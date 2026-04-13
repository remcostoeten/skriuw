import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthSnapshot } from "@/platform/auth";
import { PERSISTED_STORE_NAMES } from "@/core/shared/persistence-types";

let authSnapshot: AuthSnapshot = {
  mode: "privacy",
  status: "privacy",
  rememberMe: true,
  isReady: true,
  isSupabaseConfigured: true,
  user: null,
  session: null,
  error: null,
  actorId: "privacy-local",
  canSync: false,
};

let selectRows: Record<string, unknown[] | null> = {};
let selectCalls: Array<{
  table: string;
  filters: Array<[string, string, unknown]>;
  orderBy?: [string, boolean];
  maybeSingle?: boolean;
}> = [];
let upsertCalls: Array<{ table: string; rows: Record<string, unknown>[]; onConflict?: string }> = [];

async function loadRecordsModule() {
  mock.restore();

  const authModuleMock = {
    getAuthStateSnapshot: () => authSnapshot,
  };

  mock.module("@/platform/auth", () => authModuleMock);
  mock.module("@/platform/auth/index", () => authModuleMock);
  mock.module("../client", () => ({
    getSupabaseClient: () => ({
      from: (table: string) => {
        const filters: Array<[string, string, unknown]> = [];
        let orderBy: [string, boolean] | undefined;

        const selectBuilder = {
          eq(field: string, value: unknown) {
            filters.push(["eq", field, value]);
            return this;
          },
          is(field: string, value: unknown) {
            filters.push(["is", field, value]);
            return this;
          },
          order(field: string, options?: { ascending?: boolean }) {
            orderBy = [field, options?.ascending ?? true];
            selectCalls.push({ table, filters: [...filters], orderBy });
            return Promise.resolve({ data: selectRows[table] ?? [], error: null });
          },
          maybeSingle() {
            selectCalls.push({ table, filters: [...filters], maybeSingle: true });
            const rows = selectRows[table];
            return Promise.resolve({
              data: Array.isArray(rows) ? (rows[0] ?? null) : rows,
              error: null,
            });
          },
        };

        return {
          select: () => selectBuilder,
          upsert: async (rows: Record<string, unknown>[], options?: { onConflict?: string }) => {
            upsertCalls.push({ table, rows, onConflict: options?.onConflict });
            return { error: null };
          },
        };
      },
    }),
  }));

  return import(`../records?test=${Math.random().toString(36).slice(2)}`);
}

beforeEach(() => {
  authSnapshot = {
    mode: "privacy",
    status: "privacy",
    rememberMe: true,
    isReady: true,
    isSupabaseConfigured: true,
    user: null,
    session: null,
    error: null,
    actorId: "privacy-local",
    canSync: false,
  };
  selectRows = {};
  selectCalls = [];
  upsertCalls = [];
});

afterEach(() => {
  mock.restore();
});

describe("supabase record helpers", () => {
  test("lists remote notes for the authenticated user and filters out soft-deleted rows", async () => {
    const recordsModule = await loadRecordsModule();

    authSnapshot = {
      ...authSnapshot,
      mode: "account",
      status: "authenticated",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      },
      actorId: "user-123",
      canSync: true,
    };

    selectRows.notes = [
      {
        id: "note-1",
        user_id: "user-123",
        name: "Inbox.md",
        content: "# Inbox",
        rich_content: { type: "doc", content: [] },
        preferred_editor_mode: "block",
        parent_id: null,
        journal_meta: null,
        created_at: "2026-04-12T10:00:00.000Z",
        updated_at: "2026-04-12T10:00:00.000Z",
        deleted_at: null,
      },
    ];

    const notes = await recordsModule.listRemoteRecords(PERSISTED_STORE_NAMES.notes);

    expect(notes).toEqual([
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
    ]);
    expect(selectCalls[0]).toEqual({
      table: "notes",
      filters: [
        ["eq", "user_id", "user-123"],
        ["is", "deleted_at", null],
      ],
      orderBy: ["created_at", true],
    });
  });

  test("upserts remote journal entries with user scope", async () => {
    const recordsModule = await loadRecordsModule();

    authSnapshot = {
      ...authSnapshot,
      mode: "account",
      status: "authenticated",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      },
      actorId: "user-123",
      canSync: true,
    };

    await recordsModule.putRemoteRecord(PERSISTED_STORE_NAMES.journalEntries, {
      id: "entry-1",
      dateKey: "2026-04-12",
      content: "Today",
      tags: ["work"],
      mood: "good",
      createdAt: "2026-04-12T10:00:00.000Z",
      updatedAt: "2026-04-12T10:00:00.000Z",
    } as never);

    expect(upsertCalls).toEqual([
      {
        table: "journal_entries",
        onConflict: "user_id,id",
        rows: [
          {
            user_id: "user-123",
            id: "entry-1",
            date_key: "2026-04-12",
            content: "Today",
            mood: "good",
            tags: ["work"],
            created_at: "2026-04-12T10:00:00.000Z",
            updated_at: "2026-04-12T10:00:00.000Z",
            deleted_at: null,
          },
        ],
      },
    ]);
  });

  test("uses an explicit user id override instead of the live auth snapshot", async () => {
    const recordsModule = await loadRecordsModule();

    authSnapshot = {
      ...authSnapshot,
      mode: "account",
      status: "authenticated",
      user: {
        id: "user-live",
        email: "live@example.com",
        name: "Live User",
      },
      actorId: "user-live",
      canSync: true,
    };

    await recordsModule.putRemoteRecord(
      PERSISTED_STORE_NAMES.notes,
      {
        id: "note-1",
        name: "Inbox.md",
        content: "# Inbox",
        richContent: { type: "doc", content: [] },
        preferredEditorMode: "block",
        parentId: null,
        createdAt: "2026-04-12T10:00:00.000Z",
        updatedAt: "2026-04-12T10:00:00.000Z",
      } as never,
      "user-bound",
    );

    expect(upsertCalls[0]?.rows[0]).toEqual(
      expect.objectContaining({
        user_id: "user-bound",
        id: "note-1",
      }),
    );
  });
});
