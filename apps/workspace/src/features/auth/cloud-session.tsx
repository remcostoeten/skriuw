import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AuthSessionState } from "@remcostoeten/auth-drawer";
import { authAdapter } from "./better-auth/adapter";

type Props = {
  children: ReactNode;
};

export type CloudSession = {
  user: AuthSessionState["user"];
  isPending: boolean;
  signOut: () => Promise<void>;
};

const CloudSessionContext = createContext<CloudSession | null>(null);

async function signOut(): Promise<void> {
  if (!authAdapter.signOut) return;
  try {
    const result = await authAdapter.signOut();
    if (result.success) authAdapter.onSuccess?.("signOut");
  } catch (error) {
    console.error("cloud sign-out failed", error);
  }
}

/**
 * Provides the cloud session to everything below it. Mount it above the whole
 * shell, not just the settings dialog, because the rail account menu reads the
 * session while settings is closed. It reads the adapter directly instead of
 * the auth-drawer package's provider, so the drawer's code and stylesheet stay
 * in the lazy sign-in chunk.
 */
export function CloudSessionProvider({ children }: Props) {
  const { data, isPending } = authAdapter.useSession();
  const user = data?.user ?? null;
  const session = useMemo(() => ({ user, isPending, signOut }), [user, isPending]);
  return <CloudSessionContext.Provider value={session}>{children}</CloudSessionContext.Provider>;
}

export function useCloudSession(): CloudSession {
  const session = useContext(CloudSessionContext);
  if (!session) throw new Error("useCloudSession must be used within a CloudSessionProvider");
  return session;
}
