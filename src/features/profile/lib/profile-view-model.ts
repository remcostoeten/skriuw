import type { AuthSnapshot } from "@/platform/auth";

export type ProfileIdentityRow = {
  label: string;
  value: string;
};

export type ProfileMetric = {
  label: string;
  value: string;
  hint: string;
};

export type ProfileViewModel = {
  title: string;
  subtitle: string;
  statusLabel: string;
  identityRows: ProfileIdentityRow[];
  metrics: ProfileMetric[];
  isAuthenticated: boolean;
  workspaceLabel: string;
};

function formatCount(count: number, singular: string, plural: string) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function resolveStatusLabel(auth: AuthSnapshot) {
  if (auth.phase === "authenticated") {
    return "Authenticated";
  }

  if (auth.workspaceMode === "cloud") {
    return "Signed out";
  }

  return "Guest";
}

function resolveWorkspaceLabel(auth: AuthSnapshot) {
  if (auth.phase === "authenticated") {
    return "Cloud workspace";
  }

  return auth.workspaceMode === "cloud" ? "Cloud workspace on this device" : "Guest workspace";
}

export function createProfileViewModel(auth: AuthSnapshot, noteCount: number, journalEntryCount: number): ProfileViewModel {
  const isAuthenticated = auth.phase === "authenticated" && auth.user !== null;

  return {
    title: isAuthenticated ? auth.user?.name ?? "Account" : "Workspace",
    subtitle: isAuthenticated
      ? "Your cloud workspace profile and summary."
      : "Sign in to keep notes and journal entries in your own cloud account.",
    statusLabel: resolveStatusLabel(auth),
    workspaceLabel: resolveWorkspaceLabel(auth),
    isAuthenticated,
    identityRows: [
      {
        label: "Name",
        value: auth.user?.name ?? "Not signed in",
      },
      {
        label: "Email",
        value: auth.user?.email ?? "Not signed in",
      },
      {
        label: "User ID",
        value: auth.user?.id ?? "Unavailable",
      },
      {
        label: "Workspace ID",
        value: auth.workspaceId,
      },
    ],
    metrics: [
      {
        label: "Notes",
        value: formatCount(noteCount, "note", "notes"),
        hint: isAuthenticated
          ? "Private to this account."
          : "Stored locally on this device.",
      },
      {
        label: "Journal entries",
        value: formatCount(journalEntryCount, "entry", "entries"),
        hint: isAuthenticated
          ? "Private to this account."
          : "Stored locally on this device.",
      },
    ],
  };
}
