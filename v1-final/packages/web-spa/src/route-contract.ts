export const DESKTOP_ROUTE_PATHS = {
	root: "/",
	notes: "/app",
	graph: "/app/graph",
	journal: "/app/journal",
	tasks: "/app/tasks",
	trash: "/app/trash",
	activity: "/app/activity",
	tags: "/app/tags",
	tag: "/app/tags/$name",
	people: "/app/people",
	person: "/app/people/$id",
} as const;

export type DesktopRouteId = keyof typeof DESKTOP_ROUTE_PATHS;

const routeMatchers: Array<[DesktopRouteId, RegExp]> = [
	["root", /^\/$/],
	["notes", /^\/app$/],
	["graph", /^\/app\/graph$/],
	["journal", /^\/app\/journal$/],
	["tasks", /^\/app\/tasks$/],
	["trash", /^\/app\/trash$/],
	["activity", /^\/app\/activity$/],
	["tags", /^\/app\/tags$/],
	["tag", /^\/app\/tags\/[^/]+$/],
	["people", /^\/app\/people$/],
	["person", /^\/app\/people\/[^/]+$/],
];

/** Resolves browser/hash URLs through the same route contract used by TanStack Router. */
export function resolveDesktopRoute(input: string): DesktopRouteId | null {
	const withoutHash = input.startsWith("#") ? input.slice(1) : input;
	const path = withoutHash.split(/[?#]/, 1)[0]?.replace(/\/$/, "") || "/";
	return routeMatchers.find(([, matcher]) => matcher.test(path))?.[0] ?? null;
}
