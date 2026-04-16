import { describe, expect, test } from "bun:test";
import type { AuthSnapshot } from "@/platform/auth";
import { createProfileViewModel } from "@/features/profile/lib/profile-view-model";

function buildAuthSnapshot(overrides: Partial<AuthSnapshot> = {}): AuthSnapshot {
  return {
    phase: "signed_out",
    rememberMe: true,
    isReady: true,
    isSupabaseConfigured: false,
    user: null,
    session: null,
    error: null,
    workspaceId: "signed-out-local",
    ...overrides,
  };
}

describe("createProfileViewModel", () => {
  test("describes the signed-out account state and formats counts", () => {
    const viewModel = createProfileViewModel(buildAuthSnapshot(), 1, 2);

    expect(viewModel.title).toBe("Workspace");
    expect(viewModel.statusLabel).toBe("Signed out");
    expect(viewModel.workspaceLabel).toBe("Account required");
    expect(viewModel.isAuthenticated).toBe(false);
    expect(viewModel.identityRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "User ID", value: "Unavailable" }),
        expect.objectContaining({ label: "Workspace ID", value: "signed-out-local" }),
      ]),
    );
    expect(viewModel.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Notes", value: "1 note", hint: "Available after sign-in." }),
        expect.objectContaining({
          label: "Journal entries",
          value: "2 entries",
          hint: "Available after sign-in.",
        }),
      ]),
    );
  });

  test("describes an authenticated cloud workspace", () => {
    const viewModel = createProfileViewModel(
      buildAuthSnapshot({
        phase: "authenticated",
        isSupabaseConfigured: true,
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
