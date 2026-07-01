export type CommandPaletteItem = {
	id: string;
	label: string;
	shortcut?: string;
	keywords?: string[];
	description?: string;
	hint?: string;
	group?: string;
	alwaysShow?: boolean;
	/**
	 * Hidden while the palette is idle (no query, no bang). Surfaces only once
	 * the user searches or scopes to its group with a bang. Keeps large indexes
	 * — every individual setting — out of the default view.
	 */
	searchOnly?: boolean;
	action: () => void;
};

export type CommandPaletteGroup = {
	group: string;
	items: CommandPaletteItem[];
};

const DEFAULT_GROUP = "Actions";
const GROUP_ORDER = [DEFAULT_GROUP, "Notes", "Recent", "Navigation", "Editor", "Settings", "Help"];

/**
 * Bang prefixes scope the palette to a slice of groups. `!n foo` searches only
 * notes for "foo"; a bare `!s` lists every setting. The map values are the
 * groups each bang keeps visible.
 */
export const COMMAND_BANGS: Record<string, { label: string; groups: string[] }> = {
	a: { label: "Actions", groups: [DEFAULT_GROUP, "Navigation", "Editor", "Help"] },
	n: { label: "Notes", groups: ["Notes", "Recent"] },
	s: { label: "Settings", groups: ["Settings"] },
};

export type ParsedCommandQuery = {
	bang: string | null;
	allowedGroups: Set<string> | null;
	query: string;
};

/**
 * Splits a leading `!x` bang off the raw input. Returns the matched bang key
 * (or null), the set of groups it unlocks, and the remaining search text. A
 * lone `!` or an unknown bang is treated as plain text so typing stays fluid.
 */
export function parseCommandQuery(raw: string): ParsedCommandQuery {
	const match = raw.match(/^!([a-z])(?:\s+(.*))?$/i);
	if (match) {
		const key = match[1].toLowerCase();
		const bang = COMMAND_BANGS[key];
		if (bang) {
			return {
				bang: key,
				allowedGroups: new Set(bang.groups),
				query: (match[2] ?? "").trim(),
			};
		}
	}

	return { bang: null, allowedGroups: null, query: raw.trim() };
}

function getItemGroup(item: CommandPaletteItem) {
	return item.group?.trim() || DEFAULT_GROUP;
}

function getSearchHaystack(item: CommandPaletteItem) {
	return [
		item.label,
		item.description,
		item.hint,
		item.shortcut,
		getItemGroup(item),
		...(item.keywords ?? []),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function compareGroups(a: string, b: string) {
	const aIndex = GROUP_ORDER.indexOf(a);
	const bIndex = GROUP_ORDER.indexOf(b);
	if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
	if (aIndex >= 0) return -1;
	if (bIndex >= 0) return 1;
	return a.localeCompare(b);
}

export function getCommandPaletteGroups(
	items: CommandPaletteItem[],
	query: string,
): CommandPaletteGroup[] {
	const { allowedGroups, query: searchQuery } = parseCommandQuery(query);
	const normalizedQuery = searchQuery.toLowerCase();
	const bangActive = allowedGroups !== null;
	const grouped = new Map<string, CommandPaletteItem[]>();

	for (const item of items) {
		const group = getItemGroup(item);

		if (allowedGroups && !allowedGroups.has(group)) {
			continue;
		}

		if (item.searchOnly && !normalizedQuery && !bangActive) {
			continue;
		}

		const matchesQuery =
			!normalizedQuery ||
			(item.alwaysShow ?? false) ||
			getSearchHaystack(item).includes(normalizedQuery);

		if (!matchesQuery) {
			continue;
		}

		const groupItems = grouped.get(group) ?? [];
		groupItems.push(item);
		grouped.set(group, groupItems);
	}

	return [...grouped.entries()]
		.sort(([a], [b]) => compareGroups(a, b))
		.map(([group, groupItems]) => ({ group, items: groupItems }));
}
