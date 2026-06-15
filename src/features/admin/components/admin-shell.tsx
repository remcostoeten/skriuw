"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceBackendProvider } from "@/core/workspace-backend";
import { AdminNav } from "./admin-nav";

type Props = {
	children: ReactNode;
};

export function AdminShell({ children }: Props) {
	const [queryClient] = useState(() => new QueryClient());

	return (
		<QueryClientProvider client={queryClient}>
			<WorkspaceBackendProvider>
				<div className="flex h-dvh">
					<aside className="w-56 shrink-0 border-r border-border/40 bg-muted/15">
						<AdminNav />
					</aside>
					<main className="flex-1 min-h-0 overflow-hidden">{children}</main>
				</div>
			</WorkspaceBackendProvider>
		</QueryClientProvider>
	);
}
