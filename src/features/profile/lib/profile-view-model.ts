import type { AuthSnapshot } from "@/platform/auth";

type ProfileIdentityRow = {
  label: string;
  value: string;
};

type ProfileMetric = {
  label: string;
  value: string;
};

type ProfileViewModel = {
  title: string;
  subtitle: string;
  identityRows: ProfileIdentityRow[];
  metrics: ProfileMetric[];
};

function formatCount(count: number, singular: string, plural: string) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export function createProfileViewModel(
  auth: AuthSnapshot,
  noteCount: number,
  journalEntryCount: number,
): ProfileViewModel {
  const isAuthenticated = auth.phase === "authenticated" && auth.user !== null;

  return {
    title: isAuthenticated ? (auth.user?.name ?? "Profile") : "Profile",
    subtitle: isAuthenticated
      ? (auth.user?.email ?? "Manage your account.")
      : "Sign in to sync your notes and journal.",
    identityRows: [
      {
        label: "Name",
        value: auth.user?.name ?? "Not signed in",
      },
      {
        label: "Email",
        value: auth.user?.email ?? "Not signed in",
      },
    ],
    metrics: [
      {
        label: "Notes",
        value: formatCount(noteCount, "note", "notes"),
      },
      {
        label: "Journal entries",
        value: formatCount(journalEntryCount, "entry", "entries"),
      },
    ],
  };
}
