"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useMemo, type ReactNode } from "react";
import { useAuth } from "@/core/auth/use-auth";
import { createLocalBackend } from "./local-backend";
// Imported via the `@/` path (not `./server-backend`) so the desktop SPA can
// alias-shim it in vite.config and keep the server/Prisma action graph out of
// the bundle. See packages/web-spa/src/shims/server-stub-backend.ts.
import { serverBackend } from "@/core/workspace-backend/server-backend";
import { createTauriBackend, isTauriRuntime } from "./tauri-backend";
import type { WorkspaceBackend, WorkspaceCapabilities } from "./types";

const WorkspaceBackendContext = createContext<WorkspaceBackend | null>(null);

export function WorkspaceBackendProvider({ children }: { children: ReactNode }) {
	const auth = useAuth();
	const queryClient = useQueryClient();
	const backend = useMemo<WorkspaceBackend>(() => {
		// Desktop build: a single local profile backed by Rust/SQLite, regardless
		// of auth phase (the desktop shell skips cloud auth entirely).
		if (isTauriRuntime()) return createTauriBackend();
		return auth.phase === "authenticated" ? serverBackend : createLocalBackend(queryClient);
	}, [auth.phase, queryClient]);

	return (
		<WorkspaceBackendContext.Provider value={backend}>
			{children}
		</WorkspaceBackendContext.Provider>
	);
}

export function useWorkspaceBackend(): WorkspaceBackend {
	const backend = use(WorkspaceBackendContext);
	if (!backend) {
		throw new Error("useWorkspaceBackend must be used within WorkspaceBackendProvider");
	}
	return backend;
}

export function useIsGuestWorkspace(): boolean {
	const backend = use(WorkspaceBackendContext);
	return backend?.mode === "local";
}

export function useWorkspaceCapabilities(): WorkspaceCapabilities {
	return useWorkspaceBackend().capabilities;
}
