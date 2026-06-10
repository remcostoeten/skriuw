import { WorkspaceLoadingShell } from "@/features/layout/components/app-loading-shell";

// Shown while the server seeds/prefetches the workspace. It renders the same
// static chrome (icon rail, sidebar frame, toolbar, status bar) as the real
// layout in identical positions, with skeletons only inside the data regions —
// so the handoff to the hydrated page swaps content, never the frame.
export default function AppLoading() {
	return <WorkspaceLoadingShell variant="notes" />;
}
