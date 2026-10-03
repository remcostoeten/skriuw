import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@remcostoeten/auth-drawer";
import { authAdapter } from "./better-auth/adapter";

type Props = {
  children: ReactNode;
};

/**
 * Provides the cloud session to everything below it. Mount it above the whole
 * shell, not just the settings dialog, because the rail account menu reads the
 * session while settings is closed.
 */
export function CloudSessionProvider({ children }: Props) {
  return <AuthProvider adapter={authAdapter}>{children}</AuthProvider>;
}

export function useCloudSession() {
  return useAuth();
}
