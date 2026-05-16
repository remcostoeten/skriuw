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

    expect(viewModel.title).toBe("Profile");
    expect(viewModel.subtitle).toBe("Sign in to sync your notes and journal.");
    expect(viewModel.identityRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Name", value: "Not signed in" }),
        expect.objectContaining({ label: "Email", value: "Not signed in" }),
      ]),
    );
    expect(viewModel.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Notes", value: "1 note" }),
        expect.objectContaining({ label: "Journal entries", value: "2 entries" }),
      ]),
    );
  });

  test("describes an authenticated profile", () => {
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
    expect(viewModel.subtitle).toBe("user@example.com");
    expect(viewModel.identityRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Name", value: "User Name" }),
        expect.objectContaining({ label: "Email", value: "user@example.com" }),
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
