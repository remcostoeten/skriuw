import type { SyncPresentation } from "../sync/status";
import type { AccountView } from "./account";
import type { Account } from "./client";

export type SignInMode = "sign-in" | "sign-up";

export type SignInDraft = {
  mode: SignInMode;
  name: string;
  email: string;
  password: string;
};

export type ConnectionSummary = {
  summary: string;
  detail: string | null;
  /** The account row offers "Retry sync". */
  retry: boolean;
  /** Something is in flight, so the row shows progress. */
  busy: boolean;
};

type SignedInConnection = Extract<AccountView, { kind: "signed-in" }>["connection"];

/** Whether the form can be submitted. The cloud owns the real validation. */
export function signInDraftReady(draft: SignInDraft): boolean {
  const email = draft.email.trim();
  const hasEmail = email.length > 2 && email.includes("@");
  const hasName = draft.mode === "sign-in" || draft.name.trim().length > 0;
  return hasEmail && draft.password.length > 0 && hasName;
}

export function accountSummary(account: Account): { title: string; subtitle: string | null } {
  const name = account.name?.trim() ?? "";
  return name.length > 0
    ? { title: name, subtitle: account.email }
    : { title: account.email, subtitle: null };
}

/**
 * What the signed-in row says about sync. Before replication reports, the
 * connection step speaks; after, the coordinator's status does, so the row
 * never shows "connecting" over a workspace that is already syncing.
 */
export function connectionSummary(
  connection: SignedInConnection,
  sync: SyncPresentation,
): ConnectionSummary {
  switch (connection.kind) {
    case "connecting":
      return {
        summary: "Connecting…",
        detail: "Linking this device to your cloud workspace.",
        retry: false,
        busy: true,
      };
    case "reopen-required":
      return {
        summary: "Opening this account's workspace…",
        detail:
          "Your previous account's notes stay on this device and come back when you sign in to it.",
        retry: false,
        busy: true,
      };
    case "failed":
      return { summary: connection.message, detail: null, retry: true, busy: false };
    case "connected":
      return {
        summary: sync.summary,
        detail: sync.detail,
        retry: sync.action === "retry" || sync.action === "resume",
        busy: sync.tone === "syncing",
      };
  }
}
