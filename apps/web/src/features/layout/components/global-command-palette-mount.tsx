"use client";

import { useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCommandRegistry, useRegisterCommands, COMMAND_REGISTRY } from "@/core/commands";
import { useShortcutManager } from "@/core/shortcuts";
import { useWorkspaceCapabilities } from "@/core/workspace-backend";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { focusNoteEditor } from "@/shared/lib/focus-editor";
import { CommandPalette, type CommandPaletteItem } from "@/shared/ui/command-palette";
import {
	buildSettingsCommandItems,
	buildThemeCommandItems,
} from "@/features/settings/settings-command-index";
import { toggleSettings } from "@/features/settings/use-settings-modal";
import { usePreferencesStore } from "@/features/settings/store";
import { useTourStore } from "@/features/onboarding/store";
import { THEMES } from "@/features/settings/preferences/themes";
import { useCreateFolder } from "@/features/notes/hooks/use-create-folder";
import { useCreateNote } from "@/features/notes/hooks/use-create-note";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { NOTE_PROPERTY_TEMPLATES } from "@/domain/notes/properties";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import type { CreateNoteInput } from "@/domain/notes/note-write-core";
import type { CreateFolderInput } from "@/domain/folders/actions";
import type { NoteFile } from "@/types/notes";

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

const MOBILE_HIDDEN_COMMAND_IDS = new Set([
	"notes.help",
	"journal.help",
	"settings.vim",
	"notes.focusFileTree",
	"notes.focusEditor",
	"notes.focusSidebarSearch",
	"notes.focusNextSplitPane",
	"notes.focusPreviousSplitPane",
	"notes.toggleSplit",
	"notes.splitHorizontal",
	"notes.closeSplit",
]);

export function GlobalCommandPaletteMount() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const capabilities = useWorkspaceCapabilities();
	const createNoteMutation = useCreateNote();
	const createFolderMutation = useCreateFolder();
	const isMobile = useIsMobile();

	const { getShortcutHint } = useShortcutManager();
	const { isOpen, setIsOpen, query, setQuery, activeScope, itemProviders, getRegisteredHandler } =
		useCommandRegistry();

	const defaultModeRaw = usePreferencesStore((state) => state.editor.defaultModeRaw);
	const defaultPropertiesTemplateId = usePreferencesStore(
		(state) => state.editor.notePropertiesDefaultTemplateId,
	);
	const activeTheme = usePreferencesStore((state) => state.appearance.theme);
	const updateAppearancePreference = usePreferencesStore(
		(state) => state.updateAppearancePreference,
	);
	const vimModeEnabled = usePreferencesStore((state) => state.editor.vimMode);
	const updateEditorPreference = usePreferencesStore((state) => state.updateEditorPreference);

	// =========================================================================
	// Global Fallback Command Handlers Implementation
	// =========================================================================
	const handleCreateNoteGlobal = useCallback(() => {
		triggerNativeFeedback("success");
		const id = crypto.randomUUID();
		const content = generateNoteContent("Untitled");
		const richContent = markdownToRichDocument(content);
		const preferredEditorMode = defaultModeRaw ? "raw" : "block";
		const defaultTemplate = defaultPropertiesTemplateId
			? NOTE_PROPERTY_TEMPLATES.find(
					(template) => template.id === defaultPropertiesTemplateId,
				)
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

		createNoteMutation.mutate(input, {
			onSuccess: () => {
				router.push(`/app?note=${encodeURIComponent(id)}`);
				focusNoteEditor(id);
			},
			// The seeded detail cache lives outside the mutation's own optimistic
			// rollback, so drop it on failure to avoid an orphan entry that would
			// otherwise get persisted to IndexedDB.
			onError: () => {
				queryClient.removeQueries({ queryKey: notesKeys.detail(id) });
			},
		});
	}, [createNoteMutation, defaultModeRaw, defaultPropertiesTemplateId, queryClient, router]);

	const handleCreateFolderGlobal = useCallback(() => {
		triggerNativeFeedback("impact");
		const id = crypto.randomUUID();
		const input: CreateFolderInput = {
			id,
			name: "Untitled",
			parentId: null,
		};
		createFolderMutation.mutate(input);
		router.push(`/app?shortcut=renameFolder&folder=${encodeURIComponent(id)}`);
	}, [createFolderMutation, router]);

	const cycleTheme = useCallback(() => {
		const currentIndex = THEMES.findIndex((t) => t.id === activeTheme);
		const nextTheme = THEMES[(currentIndex + 1) % THEMES.length];
		updateAppearancePreference("theme", nextTheme.id);
	}, [activeTheme, updateAppearancePreference]);

	const toggleVimMode = useCallback(() => {
		if (isMobile) return;
		updateEditorPreference("vimMode", !vimModeEnabled);
	}, [isMobile, vimModeEnabled, updateEditorPreference]);

	// Register the fallback handlers globally
	useRegisterCommands({
		"notes.newNote": handleCreateNoteGlobal,
		"notes.newFolder": handleCreateFolderGlobal,
		"notes.toggleSidebar": () => router.push(shortcutParam("toggleSidebar")),
		"notes.toggleMetadata": () => router.push(shortcutParam("toggleMetadata")),
		"notes.focusSidebarSearch": () => router.push(shortcutParam("focusSidebarSearch")),
		"notes.focusEditor": () => router.push(shortcutParam("focusEditor")),
		"notes.focusMetadata": () => router.push(shortcutParam("focusMetadata")),
		"notes.help": () => router.push(shortcutParam("help")),
		"settings.open": () => {
			triggerNativeFeedback("selection");
			toggleSettings();
		},
		"settings.theme": cycleTheme,
		"settings.vim": toggleVimMode,
		"settings.productTour": () => {
			const { resetTour, startTour } = useTourStore.getState();
			resetTour();
			startTour();
			router.push("/app");
		},
		"nav.notes": () => router.push("/app"),
		"nav.journal": () => router.push("/app/journal"),
		"nav.graph": () => router.push("/app/graph"),
		"nav.shared": () => router.push("/app/shared"),
		"nav.trash": () => router.push("/app/trash"),
	});

	// =========================================================================
	// Compute Palette Items
	// =========================================================================
	const items = useMemo<CommandPaletteItem[]>(() => {
		const staticItems: CommandPaletteItem[] = [];

		// 1. Gather all commands from registry filtered by active scope
		for (const [id, cmd] of Object.entries(COMMAND_REGISTRY) as [string, any][]) {
			// Skip journal commands if journal capability is disabled
			if (cmd.id.startsWith("journal.") && !capabilities.journal) continue;
			if (cmd.id === "nav.journal" && !capabilities.journal) continue;
			if (cmd.id === "nav.shared" && !capabilities.sharing) continue;
			if (cmd.id === "nav.trash" && !capabilities.trash) continue;
			if (isMobile && MOBILE_HIDDEN_COMMAND_IDS.has(cmd.id)) continue;

			if (cmd.scope === "global" || cmd.scope === activeScope) {
				const registeredHandler = getRegisteredHandler(id);

				// Determine label dynamically if needed
				let label = cmd.label;
				if (cmd.id === "settings.theme") {
					label = `Switch theme (current: ${activeTheme})`;
				} else if (cmd.id === "settings.vim") {
					label = vimModeEnabled ? "Disable Vim mode" : "Enable Vim mode";
				} else if (cmd.id === "notes.newNote" && activeScope === "notes") {
					// Use local label context
					const diaryModeEnabled =
						usePreferencesStore.getState().journal.diaryModeEnabled;
					label = diaryModeEnabled ? "Open today's journal" : "Create note";
				}

				staticItems.push({
					id: cmd.id,
					label,
					group: cmd.group,
					keywords: cmd.keywords,
					description: cmd.description,
					shortcut:
						!isMobile && cmd.shortcutId ? getShortcutHint(cmd.shortcutId) : undefined,
					action: registeredHandler ?? (() => {}),
				});
			}
		}

		// 2. Append settings search items (always available in search)
		staticItems.push(...buildSettingsCommandItems());
		staticItems.push(...buildThemeCommandItems());

		// 3. Append dynamic items from items providers (e.g. note search hits)
		const dynamicItems = itemProviders.flatMap((provider) => provider(query));

		return [...staticItems, ...dynamicItems];
	}, [
		capabilities.journal,
		capabilities.sharing,
		capabilities.trash,
		activeScope,
		activeTheme,
		isMobile,
		vimModeEnabled,
		getRegisteredHandler,
		getShortcutHint,
		itemProviders,
		query,
	]);

	return (
		<CommandPalette
			open={isOpen}
			onOpenChange={setIsOpen}
			onQueryChange={setQuery}
			items={items}
			description="Search notes, run actions, and navigate."
		/>
	);
}
