import { lazy, Suspense } from "react";
import {
	createHashHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { AppProviders } from "@/providers/app-providers";
import { cn } from "@/shared/lib/utils";
import { editorFontVariables } from "@/app/editor-font-loaders";
import { WindowResizeHandles } from "./components/window-resize-handles";
import { WindowDragRegion } from "./components/window-drag-region";
import { NotesLayout } from "@/features/notes/components/notes-layout";
import { JournalPageLayout } from "@/features/journal/components/journal-page-layout";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { TrashView } from "@/features/notes/components/trash/trash-view";

const WorkspaceGraph = lazy(() =>
	import("@/features/notes/components/workspace-graph").then((m) => ({
		default: m.WorkspaceGraph,
	})),
);

function GraphRouteComponent() {
	return (
		<Suspense fallback={null}>
			<WorkspaceGraph />
		</Suspense>
	);
}

function DesktopShell() {
	return (
		<AppProviders initialEditorPreferences={null}>
			<div
				style={{ height: "100dvh" }}
				className={cn(editorFontVariables, "flex flex-col overflow-hidden bg-background")}
			>
				<div className="relative min-h-0 flex-1 overflow-hidden">
					<Outlet />
				</div>
				<WindowDragRegion />
				<WindowResizeHandles />
			</div>
		</AppProviders>
	);
}

const rootRoute = createRootRoute({ component: DesktopShell });

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	beforeLoad: () => {
		throw redirect({ to: "/app" });
	},
});

const notesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app",
	component: () => <NotesLayout initialActiveFileId={null} initialUserScopeId={null} />,
});

const graphRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app/graph",
	component: GraphRouteComponent,
});

const journalRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app/journal",
	component: JournalPageLayout,
});

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app/settings",
	component: SettingsPage,
});

const trashRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app/trash",
	component: TrashView,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	notesRoute,
	graphRoute,
	journalRoute,
	settingsRoute,
	trashRoute,
]);

export const router = createRouter({
	routeTree,
	history: createHashHistory(),
	defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
