import { describe, expect, test } from "bun:test";
import type { AuthSnapshot } from "@/platform/auth";
import { createProfileViewModel } from "../profile-view-model";

function buildAuthSnapshot(overrides: Partial<AuthSnapshot> = {}): AuthSnapshot {
  return {
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
    ...overrides,
  };
}

describe("createProfileViewModel", () => {
  test("describes the guest workspace and formats counts", () => {
    const viewModel = createProfileViewModel(buildAuthSnapshot(), 1, 2);

    expect(viewModel.title).toBe("Workspace");
    expect(viewModel.statusLabel).toBe("Guest");
    expect(viewModel.workspaceLabel).toBe("Guest workspace");
    expect(viewModel.isAuthenticated).toBe(false);
    expect(viewModel.identityRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "User ID", value: "Unavailable" }),
        expect.objectContaining({ label: "Workspace ID", value: "guest-local" }),
      ]),
    );
    expect(viewModel.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Notes", value: "1 note" }),
        expect.objectContaining({ label: "Journal entries", value: "2 entries" }),
      ]),
    );
  });

  test("describes an authenticated cloud workspace", () => {
    const viewModel = createProfileViewModel(
      buildAuthSnapshot({
        mode: "cloud",
        status: "authenticated",
        isSupabaseConfigured: true,
        canSync: true,
        workspaceId: "user-123",
        user: {
          id: "user-123",
          email: "user@example.com",
          name: "User Name",
        },
      }),
      12,
      7,
    );

    expect(viewModel.title).toBe("User Name");
    expect(viewModel.subtitle).toContain("cloud workspace profile");
    expect(viewModel.statusLabel).toBe("Authenticated");
    expect(viewModel.workspaceLabel).toBe("Cloud workspace");
    expect(viewModel.isAuthenticated).toBe(true);
    expect(viewModel.identityRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Email", value: "user@example.com" }),
        expect.objectContaining({ label: "Workspace ID", value: "user-123" }),
      ]),
    );
    expect(viewModel.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Notes", value: "12 notes" }),
        expect.objectContaining({ label: "Journal entries", value: "7 entries" }),
      ]),
    );
  });
});
