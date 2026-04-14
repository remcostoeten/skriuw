import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let authSnapshot = {
  mode: "guest" as const,
  status: "guest" as const,
  rememberMe: true,
  isReady: true,
  isSupabaseConfigured: false,
  user: null as null | {
    id: string;
    email: string;
    name: string;
  },
  session: null,
  error: null,
  workspaceId: "guest-local",
  canSync: false,
};

async function loadModule() {
  mock.module("@/platform/auth", () => ({
    getAuthStateSnapshot: () => authSnapshot,
  }));

  return import(`../workspace-target?test=${Math.random().toString(36).slice(2)}`);
}

beforeEach(() => {
    authSnapshot = {
      mode: "guest",
      status: "guest",
    rememberMe: true,
    isReady: true,
    isSupabaseConfigured: false,
      user: null,
      session: null,
      error: null,
      workspaceId: "guest-local",
      canSync: false,
    };
});

afterEach(() => {
  mock.restore();
});

describe("workspace target resolution", () => {
  test("resolves to the local workspace when there is no authenticated cloud session", async () => {
    const { getWorkspaceTarget } = await loadModule();

    expect(getWorkspaceTarget()).toEqual({
      kind: "local",
      workspaceId: "guest-local",
    });
  });

  test("resolves to the cloud workspace when the authenticated session can sync", async () => {
    authSnapshot = {
      ...authSnapshot,
      mode: "cloud",
      status: "authenticated",
      isSupabaseConfigured: true,
      workspaceId: "user-123",
      canSync: true,
      user: {
        id: "user-123",
        email: "user-123@example.com",
        name: "User 123",
      },
    };

    const { getWorkspaceTarget } = await loadModule();

    expect(getWorkspaceTarget()).toEqual({
      kind: "cloud",
      workspaceId: "user-123",
      userId: "user-123",
    });
  });
});
