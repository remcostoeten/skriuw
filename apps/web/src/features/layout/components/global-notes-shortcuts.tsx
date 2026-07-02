"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useShortcutMap, type ShortcutMap } from "@remcostoeten/use-shortcut/react";
import type { CreateFolderInput } from "@/domain/folders/actions";
import type { CreateNoteInput } from "@/domain/notes/actions";
import { NOTE_PROPERTY_TEMPLATES } from "@/domain/notes/properties";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { useShortcutManager, type ShortcutId } from "@/core/shortcuts";
import { useWorkspaceCapabilities } from "@/core/workspace-backend";
import { focusActiveEditor } from "@/shared/lib/focus-editor";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { CommandPalette, type CommandPaletteItem } from "@/shared/ui/command-palette";
import { buildSettingsCommandItems } from "@/features/settings/settings-command-index";
import { usePreferencesStore } from "@/features/settings/store";
import { useCreateFolder } from "@/features/notes/hooks/use-create-folder";
import { useCreateNote } from "@/features/notes/hooks/use-create-note";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import type { NoteFile } from "@/types/notes";

const ROUTES_WITH_OWN_NOTES_HANDLERS = new Set(["/app", "/app/journal"]);
const GLOBAL_SHORTCUT_IDS: ShortcutId[] = [
	"app.commandPalette",
	"notes.newNote",
	"notes.newFolder",
	"notes.toggleSidebar",
	"notes.toggleMetadata",
	"notes.focusSidebarSearch",
	"notes.focusEditor",
	"notes.help",
	"app.settings",
];

function hasOwnNotesHandlers(pathname: string): boolean {
	return ROUTES_WITH_OWN_NOTES_HANDLERS.has(pathname);
}

function generateNoteContent(name: string): string {
	const title = name.replace(/\.md$/, "");
	return `# ${title}

#draft #idea

Start writing here. Use # for tags, @ to mention notes, or /tag and /link note from the block editor.
`;
}

function shortcutParam(param: string): string {
	return `/app?shortcut=${encodeURIComponent(param)}`;
}

function useResolvedShortcutMap(
	ids: ShortcutId[],
	handlers: Partial<Record<ShortcutId, (event: KeyboardEvent) => void>>,
): ShortcutMap {
	const { registry, bindings } = useShortcutManager();

	return useMemo<ShortcutMap>(() => {
		const map: ShortcutMap = {};
		for (const id of ids) {
			const def = registry[id];
			const handler = handlers[id];
			if (!def || !handler) continue;
			map[id] = {
				keys: bindings[id] ?? def.keys,
				handler,
				options: {
					except: def.except === false ? undefined : (def.except ?? "typing"),
					preventDefault: def.preventDefault,
					description: def.description ?? def.label,
				},
			};
		}
		return map;
	}, [bindings, handlers, ids, registry]);
}

/**
 * Registers notes commands on non-notes routes so core note actions remain
 * reachable from settings, graph, trash, shared views, and similar app screens.
 * The notes layout keeps owning the same ids while `/app` is mounted to avoid
 * duplicate handlers and to preserve its richer in-place behavior.
 */
export function GlobalNotesShortcuts() {
	const pathname = usePathname();
	const router = useRouter();
	const queryClient = useQueryClient();
	const capabilities = useWorkspaceCapabilities();
	const createNoteMutation = useCreateNote();
	const createFolderMutation = useCreateFolder();
	const defaultModeRaw = usePreferencesStore((state) => state.editor.defaultModeRaw);
	const defaultPropertiesTemplateId = usePreferencesStore(
		(state) => state.editor.notePropertiesDefaultTemplateId,
	);
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

	const globalNotesActive = !hasOwnNotesHandlers(pathname);

	const createNote = useCallback(() => {
		triggerNativeFeedback("success");
		const id = crypto.randomUUID();
		const content = generateNoteContent("Untitled");
		const richContent = markdownToRichDocument(content);
		const preferredEditorMode = defaultModeRaw ? "raw" : "block";
		const defaultTemplate = defaultPropertiesTemplateId
			? NOTE_PROPERTY_TEMPLATES.find((template) => template.id === defaultPropertiesTemplateId)
			: null;
		const properties = defaultTemplate?.build() ?? [];
		const input: CreateNoteInput = {
			id,
			name: "Untitled.md",
			content,
			richContent,
			preferredEditorMode,
			parentId: null,
			properties,
		};

		queryClient.setQueryData<NoteFile>(notesKeys.detail(id), {
			id,
			name: input.name,
			content,
			richContent,
			preferredEditorMode,
			createdAt: new Date(),
			modifiedAt: new Date(),
			parentId: null,
			tags: [],
			properties,
		});

		createNoteMutation.mutate(input);
		router.push(`/app?note=${encodeURIComponent(id)}`);
	}, [createNoteMutation, defaultModeRaw, defaultPropertiesTemplateId, queryClient, router]);

	const createFolder = useCallback(() => {
		triggerNativeFeedback("impact");
		const input: CreateFolderInput = {
			id: crypto.randomUUID(),
			name: "Untitled",
			parentId: null,
		};
		createFolderMutation.mutate(input);
		router.push(shortcutParam("focusSidebarSearch"));
	}, [createFolderMutation, router]);

	const openCommandPalette = useCallback(() => {
		triggerNativeFeedback("selection");
		setCommandPaletteOpen(true);
	}, []);

	const handlers = useMemo<Partial<Record<ShortcutId, (event: KeyboardEvent) => void>>>(
		() => ({
			"app.commandPalette": openCommandPalette,
			"notes.newNote": createNote,
			"notes.newFolder": createFolder,
			"notes.toggleSidebar": () => router.push(shortcutParam("toggleSidebar")),
			"notes.toggleMetadata": () => router.push(shortcutParam("toggleMetadata")),
			"notes.focusSidebarSearch": () => router.push(shortcutParam("focusSidebarSearch")),
			"notes.focusEditor": () => {
				if (!globalNotesActive) {
					focusActiveEditor();
					return;
				}
				router.push(shortcutParam("focusEditor"));
			},
			"notes.help": () => router.push(shortcutParam("help")),
			"app.settings": () => router.push("/app/settings"),
		}),
		[createFolder, createNote, globalNotesActive, openCommandPalette, router],
	);

	const shortcutMap = useResolvedShortcutMap(
		GLOBAL_SHORTCUT_IDS,
		handlers,
	);

	useShortcutMap(shortcutMap, {
		disabled: !globalNotesActive,
		ignoreInputs: false,
	});

	const items = useMemo<CommandPaletteItem[]>(() => {
		function go(href: string) {
			return () => router.push(href);
		}

		const navItems: CommandPaletteItem[] = [
			{
				id: "notes.new-note",
				label: "Create note",
				group: "Notes",
				shortcut: "mod+n",
				action: createNote,
			},
			{
				id: "notes.new-folder",
				label: "Create folder",
				group: "Notes",
				shortcut: "mod+shift+n",
				action: createFolder,
			},
			{
				id: "nav.notes",
				label: "Go to Notes",
				group: "Navigation",
				action: go("/app"),
			},
			{
				id: "nav.settings",
				label: "Open Settings",
				group: "Settings",
				shortcut: "mod+comma",
				action: go("/app/settings"),
			},
		];

		if (capabilities.journal) {
			navItems.push({
				id: "nav.journal",
				label: "Go to Journal",
				group: "Navigation",
				action: go("/app/journal"),
			});
		}

		navItems.push({
			id: "nav.graph",
			label: "Go to Graph",
			group: "Navigation",
			action: go("/app/graph"),
		});

		if (capabilities.sharing) {
			navItems.push({
				id: "nav.shared",
				label: "Go to Shared",
				group: "Navigation",
				action: go("/app/shared"),
			});
		}

		if (capabilities.trash) {
			navItems.push({
				id: "nav.trash",
				label: "Go to Trash",
				group: "Navigation",
				action: go("/app/trash"),
			});
		}

		navItems.push(...buildSettingsCommandItems((href) => router.push(href)));
		return navItems;
	}, [capabilities.journal, capabilities.sharing, capabilities.trash, createFolder, createNote, router]);

	return (
		<CommandPalette
			open={commandPaletteOpen}
			onOpenChange={setCommandPaletteOpen}
			items={items}
			description="Navigate and run note actions from anywhere."
		/>
	);
}
