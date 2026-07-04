"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useShortcutScope } from "@/core/shortcuts";
import { fuzzyMatchScore } from "@/shared/lib/fuzzy-match";
import { CommandPalette, type CommandPaletteItem } from "@/shared/ui/command-palette";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { useNoteSearch } from "@/features/notes/hooks/use-note-search";
import { useNotesStore } from "@/features/notes/store";
import { useQuickSwitcher } from "@/features/notes/use-quick-switcher";

function noteTitle(name: string): string {
	return name.replace(/\.md$/i, "");
}

function openNoteHref(id: string): string {
	return `/app?note=${encodeURIComponent(id)}`;
}

/**
 * Obsidian-style quick switcher (mod+p). Fuzzy-search notes by title, recents
 * surfaced first when the query is empty. On desktop, title matches are backed
 * by SQLite FTS5 content hits. Reuses the command palette surface so keyboard
 * navigation, styling, and fuzzy scoring stay consistent.
 */
export function QuickSwitcherMount() {
	const router = useRouter();
	const isOpen = useQuickSwitcher((state) => state.isOpen);
	const open = useQuickSwitcher((state) => state.open);
	const close = useQuickSwitcher((state) => state.close);
	const toggle = useQuickSwitcher((state) => state.toggle);
	const recentFileIds = useNotesStore((state) => state.recentFileIds);

	const [query, setQuery] = useState("");
	const { data: notes } = useNotes();
	const { supportsContentSearch, hits } = useNoteSearch(query);

	useShortcutScope("app", { "app.quickSwitcher": toggle });

	const openNote = useCallback(
		(id: string) => {
			router.push(openNoteHref(id));
		},
		[router],
	);

	const items = useMemo<CommandPaletteItem[]>(() => {
		if (!notes) return [];

		const recentRank = new Map<string, number>();
		recentFileIds.forEach((id, index) => recentRank.set(id, index));

		const ordered = [...notes].sort((a, b) => {
			const ra = recentRank.get(a.id);
			const rb = recentRank.get(b.id);
			if (ra !== undefined && rb !== undefined) return ra - rb;
			if (ra !== undefined) return -1;
			if (rb !== undefined) return 1;
			return noteTitle(a.name).localeCompare(noteTitle(b.name));
		});

		const titleItems: CommandPaletteItem[] = ordered.map((note) => ({
			id: `note:${note.id}`,
			label: noteTitle(note.name),
			group: "Notes",
			keywords: note.tags,
			searchOnly: !recentRank.has(note.id),
			action: () => openNote(note.id),
		}));

		if (!supportsContentSearch || !query.trim()) {
			return titleItems;
		}

		const contentItems: CommandPaletteItem[] = hits
			.filter((hit) => fuzzyMatchScore(query, noteTitle(hit.name)) === null)
			.map((hit) => ({
				id: `note-hit:${hit.id}`,
				label: noteTitle(hit.name),
				hint: hit.snippet,
				group: "In note text",
				alwaysShow: true,
				action: () => openNote(hit.id),
			}));

		return [...titleItems, ...contentItems];
	}, [notes, recentFileIds, supportsContentSearch, query, hits, openNote]);

	return (
		<CommandPalette
			open={isOpen}
			onOpenChange={(next) => (next ? open() : close())}
			onQueryChange={setQuery}
			items={items}
			title="Quick switcher"
			description="Jump to a note by name."
		/>
	);
}
