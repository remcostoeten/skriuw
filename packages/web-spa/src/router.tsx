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
import { normalizeStoredTagEntry } from "@/domain/tags/normalize";
import { cn } from "@/shared/lib/utils";
import { editorFontVariables } from "@/app/editor-font-loaders";
import { WindowResizeHandles } from "./components/window-resize-handles";
import { WindowDragRegion } from "./components/window-drag-region";
import { DesktopZoom } from "@/features/desktop/desktop-zoom";
import { NotesLayout } from "@/features/notes/components/notes-layout";
import { JournalPageLayout } from "@/features/journal/components/journal-page-layout";
import { TrashView } from "@/features/notes/components/trash/trash-view";
import { SettingsModal } from "@/features/settings/components/settings-modal";

const WorkspaceGraph = lazy(() =>
	import("@/features/notes/components/workspace-graph").then((m) => ({
		default: m.WorkspaceGraph,
	})),
);

const TagsOverview = lazy(() =>
	import("@/features/tags/components/tags-overview").then((m) => ({
		default: m.TagsOverview,
	})),
);

const TagInsights = lazy(() =>
	import("@/features/tags/components/tag-insights").then((m) => ({
		default: m.TagInsights,
	})),
);

const PeopleOverview = lazy(() =>
	import("@/features/people/components/people-overview").then((m) => ({
		default: m.PeopleOverview,
	})),
);

const PersonInsights = lazy(() =>
	import("@/features/people/components/person-insights").then((m) => ({
		default: m.PersonInsights,
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
			<DesktopZoom />
			<SettingsModal />
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

const trashRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app/trash",
	component: TrashView,
});

const tagsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app/tags",
	component: () => (
		<Suspense fallback={null}>
			<TagsOverview />
		</Suspense>
	),
});

function TagInsightsRouteComponent() {
	const { name } = tagDetailRoute.useParams();
	return (
		<Suspense fallback={null}>
			<TagInsights name={normalizeStoredTagEntry(decodeURIComponent(name))} />
		</Suspense>
	);
}

const tagDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app/tags/$name",
	component: TagInsightsRouteComponent,
});

const peopleRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app/people",
	component: () => (
		<Suspense fallback={null}>
			<PeopleOverview />
		</Suspense>
	),
});

function PersonInsightsRouteComponent() {
	const { id } = personDetailRoute.useParams();
	return (
		<Suspense fallback={null}>
			<PersonInsights personId={id} />
		</Suspense>
	);
}

const personDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app/people/$id",
	component: PersonInsightsRouteComponent,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	notesRoute,
	graphRoute,
	journalRoute,
	trashRoute,
	tagsRoute,
	tagDetailRoute,
	peopleRoute,
	personDetailRoute,
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
