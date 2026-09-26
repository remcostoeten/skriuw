import type { GotoFocusDestination, GotoRouteDestination } from "./goto-types";

const claimedIds = new Set<string>();

function claimId(id: string): void {
	if (claimedIds.has(id)) {
		throw new Error(`[quick-access] duplicate goto destination id "${id}"`);
	}
	claimedIds.add(id);
}

function createGotoFocus(focusTarget: string, label: string): GotoFocusDestination {
	const id = `focus.${focusTarget}`;
	claimId(id);
	return { id, type: "focus", label, focusTarget };
}

function createGotoRoute(name: string, label: string, path: string): GotoRouteDestination {
	const id = `route.${name}`;
	claimId(id);
	return { id, type: "route", label, path };
}

/**
 * The single source of truth for every quick-navigation destination. Targets
 * must reference these values — never ad-hoc strings — so the hint system can
 * derive labels and enforce that each destination is mounted at most once.
 */
export const goto = {
	focus: {
		editor: createGotoFocus("editor", "Editor"),
		leftSidebar: createGotoFocus("leftSidebar", "File tree"),
		rightSidebar: createGotoFocus("rightSidebar", "Note details"),
		searchInput: createGotoFocus("searchInput", "Sidebar search"),
	},
	route: {
		notes: createGotoRoute("notes", "Notes", "/app"),
		journal: createGotoRoute("journal", "Journal", "/app/journal"),
		tasks: createGotoRoute("tasks", "Tasks", "/app/tasks"),
		graph: createGotoRoute("graph", "Graph", "/app/graph"),
		tags: createGotoRoute("tags", "Tags", "/app/tags"),
		people: createGotoRoute("people", "People", "/app/people"),
		activity: createGotoRoute("activity", "Activity", "/app/activity"),
		trash: createGotoRoute("trash", "Trash", "/app/trash"),
	},
} as const;
