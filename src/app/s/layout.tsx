"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceBackendProvider } from "@/core/workspace-backend";

export default function SharedNoteLayout({ children }: { children: ReactNode }) {
	const [queryClient] = useState(() => new QueryClient());

	return (
		<QueryClientProvider client={queryClient}>
			<WorkspaceBackendProvider>{children}</WorkspaceBackendProvider>
		</QueryClientProvider>
	);
}
