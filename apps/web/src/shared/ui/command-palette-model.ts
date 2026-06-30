export type CommandPaletteItem = {
	id: string;
	label: string;
	shortcut?: string;
	keywords?: string[];
	description?: string;
	hint?: string;
	group?: string;
	alwaysShow?: boolean;
	action: () => void;
};

export type CommandPaletteGroup = {
	group: string;
	items: CommandPaletteItem[];
};

const DEFAULT_GROUP = "Actions";
const GROUP_ORDER = [DEFAULT_GROUP, "Notes", "Recent", "Navigation", "Editor", "Settings", "Help"];

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
	const normalizedQuery = query.trim().toLowerCase();
	const grouped = new Map<string, CommandPaletteItem[]>();

	for (const item of items) {
		if (!item.alwaysShow && normalizedQuery && !getSearchHaystack(item).includes(normalizedQuery)) {
			continue;
		}

		const group = getItemGroup(item);
		const groupItems = grouped.get(group) ?? [];
		groupItems.push(item);
		grouped.set(group, groupItems);
	}

	return [...grouped.entries()]
		.sort(([a], [b]) => compareGroups(a, b))
		.map(([group, groupItems]) => ({ group, items: groupItems }));
}
