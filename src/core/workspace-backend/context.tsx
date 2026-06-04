"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@/core/auth/use-auth";
import { createLocalBackend } from "./local-backend";
import { serverBackend } from "./server-backend";
import type { WorkspaceBackend } from "./types";

const WorkspaceBackendContext = createContext<WorkspaceBackend | null>(null);

export function WorkspaceBackendProvider({ children }: { children: ReactNode }) {
	const auth = useAuth();
	const queryClient = useQueryClient();
	const backend = useMemo<WorkspaceBackend>(
		() =>
			auth.phase === "authenticated"
				? serverBackend
				: createLocalBackend(queryClient),
		[auth.phase, queryClient],
	);

	return (
		<WorkspaceBackendContext.Provider value={backend}>
			{children}
		</WorkspaceBackendContext.Provider>
	);
}

export function useWorkspaceBackend(): WorkspaceBackend {
	const backend = useContext(WorkspaceBackendContext);
	if (!backend) {
		throw new Error("useWorkspaceBackend must be used within WorkspaceBackendProvider");
	}
	return backend;
}

export function useIsGuestWorkspace(): boolean {
	const backend = useContext(WorkspaceBackendContext);
	return backend?.mode === "local";
}
