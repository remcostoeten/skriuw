import { describe, expect, test } from "bun:test";
import {
	getCommandPaletteGroups,
	parseCommandQuery,
	type CommandPaletteItem,
} from "@/shared/ui/command-palette-model";

const noop = () => {};

describe("getCommandPaletteGroups", () => {
	test("filters commands by label, description, shortcut, keywords, hint, and group", () => {
		const items: CommandPaletteItem[] = [
			{
				id: "new-note",
				label: "Create note",
				shortcut: "mod+n",
				description: "Create a fresh note.",
				keywords: ["file"],
				group: "Actions",
				action: noop,
			},
			{
				id: "handbook",
				label: "Skriuw handbook",
				hint: "Guides",
				group: "Notes",
				action: noop,
			},
			{
				id: "settings",
				label: "Open settings",
				group: "Settings",
				action: noop,
			},
		];

		expect(getCommandPaletteGroups(items, "guide")).toEqual([
			{ group: "Notes", items: [items[1]] },
		]);
		expect(getCommandPaletteGroups(items, "mod+n")).toEqual([
			{ group: "Actions", items: [items[0]] },
		]);
		expect(getCommandPaletteGroups(items, "settings")).toEqual([
			{ group: "Settings", items: [items[2]] },
		]);
	});

	test("bang prefixes scope results to their groups and strip the bang from the query", () => {
		const items: CommandPaletteItem[] = [
			{ id: "note", label: "Dark notes", group: "Notes", alwaysShow: true, action: noop },
			{
				id: "theme",
				label: "Theme",
				group: "Settings",
				keywords: ["dark"],
				searchOnly: true,
				action: noop,
			},
			{ id: "sidebar", label: "Toggle sidebar", group: "Navigation", action: noop },
		];

		expect(getCommandPaletteGroups(items, "!s dark").map((group) => group.group)).toEqual([
			"Settings",
		]);
		expect(getCommandPaletteGroups(items, "!n").map((group) => group.group)).toEqual(["Notes"]);
		expect(getCommandPaletteGroups(items, "!a").map((group) => group.group)).toEqual([
			"Navigation",
		]);
	});

	test("searchOnly items stay hidden until searched or scoped by a bang", () => {
		const items: CommandPaletteItem[] = [
			{ id: "action", label: "Create note", group: "Actions", action: noop },
			{
				id: "theme",
				label: "Theme",
				group: "Settings",
				keywords: ["dark"],
				searchOnly: true,
				action: noop,
			},
		];

		expect(getCommandPaletteGroups(items, "").map((group) => group.group)).toEqual(["Actions"]);
		expect(getCommandPaletteGroups(items, "dark").map((group) => group.group)).toEqual([
			"Settings",
		]);
		expect(getCommandPaletteGroups(items, "!s").map((group) => group.group)).toEqual([
			"Settings",
		]);
	});

	test("parseCommandQuery treats unknown or lone bangs as plain text", () => {
		expect(parseCommandQuery("!s dark")).toMatchObject({ bang: "s", query: "dark" });
		expect(parseCommandQuery("!z foo")).toMatchObject({ bang: null, query: "!z foo" });
		expect(parseCommandQuery("!")).toMatchObject({ bang: null, query: "!" });
		expect(parseCommandQuery("  hello ")).toMatchObject({ bang: null, query: "hello" });
	});

	test("uses prototype group order before custom groups", () => {
		const items: CommandPaletteItem[] = [
			{ id: "recent", label: "Recent file", group: "Recent", action: noop },
			{ id: "custom", label: "Custom command", group: "Workspace", action: noop },
			{ id: "note", label: "Note file", group: "Notes", action: noop },
			{ id: "action", label: "Action", action: noop },
		];

		expect(getCommandPaletteGroups(items, "").map((group) => group.group)).toEqual([
			"Recent",
			"Actions",
			"Notes",
			"Workspace",
		]);
	});

	test("fuzzy matches subsequences and ranks label hits above keyword hits", () => {
		const items: CommandPaletteItem[] = [
			{
				id: "keyword-hit",
				label: "Create file",
				keywords: ["note"],
				group: "Actions",
				action: noop,
			},
			{ id: "label-hit", label: "Note file", group: "Actions", action: noop },
			{
				id: "subsequence-hit",
				label: "Open Settings Theme",
				group: "Actions",
				action: noop,
			},
		];

		const subsequenceIds = getCommandPaletteGroups(items, "ost")
			.flatMap((group) => group.items)
			.map((item) => item.id);
		expect(subsequenceIds).toContain("subsequence-hit");

		const rankedIds = getCommandPaletteGroups(items, "note")
			.flatMap((group) => group.items)
			.map((item) => item.id);
		expect(rankedIds.indexOf("label-hit")).toBeLessThan(rankedIds.indexOf("keyword-hit"));
	});

	test("orders Recent by descending frecency and caps it at five items", () => {
		const items: CommandPaletteItem[] = Array.from({ length: 7 }, (_, index) => ({
			id: `command-${index}`,
			label: `Command ${index}`,
			group: "Actions",
			action: noop,
		}));
		const frecency = Object.fromEntries(items.map((item, index) => [item.id, index + 1]));

		const groups = getCommandPaletteGroups(items, "", frecency);
		expect(groups[0].group).toBe("Recent");
		expect(groups[0].items.map((item) => item.id)).toEqual([
			"command-6",
			"command-5",
			"command-4",
			"command-3",
			"command-2",
		]);
	});

	test("surfaces frecent commands in the Recent group when idle", () => {
		const items: CommandPaletteItem[] = [
			{ id: "used-often", label: "Used often", group: "Actions", action: noop },
			{ id: "never-used", label: "Never used", group: "Actions", action: noop },
		];

		const groups = getCommandPaletteGroups(items, "", { "used-often": 3 });
		expect(groups[0]).toEqual({ group: "Recent", items: [items[0]] });

		const searching = getCommandPaletteGroups(items, "used", { "used-often": 3 });
		expect(searching.map((group) => group.group)).not.toContain("Recent");
	});
});
