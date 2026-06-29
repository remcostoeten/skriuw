import { describe, expect, test } from "bun:test";
import {
	getCommandPaletteGroups,
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

	test("uses prototype group order before custom groups", () => {
		const items: CommandPaletteItem[] = [
			{ id: "recent", label: "Recent file", group: "Recent", action: noop },
			{ id: "custom", label: "Custom command", group: "Workspace", action: noop },
			{ id: "note", label: "Note file", group: "Notes", action: noop },
			{ id: "action", label: "Action", action: noop },
		];

		expect(getCommandPaletteGroups(items, "").map((group) => group.group)).toEqual([
			"Actions",
			"Notes",
			"Recent",
			"Workspace",
		]);
	});
});
