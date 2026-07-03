import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { NoteFile } from "@/types/notes";

type MockFn = (...args: any[]) => any;
const createMock = mock as unknown as (implementation: MockFn) => MockFn & {
	mock: { calls: unknown[][] };
};

type NotesStoreState = {
	activeFileId: string;
	primaryTabs: unknown[];
	secondaryTabs: unknown[];
	recentFileIds: string[];
	split: {
		secondaryFileId: string | null;
		focusedPane: "primary" | "secondary";
		scrollPositions: Record<string, number>;
		orientation: "vertical" | "horizontal";
		secondaryFirst: boolean;
	};
	ui: {
		isMobile: boolean;
		showSidebar: boolean;
		showMetadata: boolean;
		sidebarWidth: number;
		selectedInspectorTag: string | null;
	};
	folderOpenState: Record<string, boolean>;
	saveStates: Record<string, "idle" | "saving" | "saved" | "error">;
};

let notes: NoteFile[];
let notesStoreState: NotesStoreState;
let flush: ReturnType<typeof createMock>;
let flushAll: ReturnType<typeof createMock>;

function makeNote(id: string): NoteFile {
	return {
		id,
		name: `${id}.md`,
		content: `# ${id}`,
		richContent: [],
		preferredEditorMode: "block",
		createdAt: new Date("2026-06-10T10:00:00.000Z"),
		modifiedAt: new Date("2026-06-10T10:00:00.000Z"),
		parentId: null,
	};
}

function createInitialStoreState(): NotesStoreState {
	return {
		activeFileId: "note-a",
		primaryTabs: [],
		secondaryTabs: [],
		recentFileIds: [],
		split: {
			secondaryFileId: null,
			focusedPane: "primary",
			scrollPositions: {},
			orientation: "vertical",
			secondaryFirst: false,
		},
		ui: {
			isMobile: false,
			showSidebar: true,
			showMetadata: true,
			sidebarWidth: 280,
			selectedInspectorTag: null,
		},
		folderOpenState: {},
		saveStates: {},
	};
}

function createStoreApi() {
	return {
		getFileSaveState: (id: string | null | undefined) =>
			id ? (notesStoreState.saveStates[id] ?? "idle") : "idle",
		setActiveFileId: (id: string) => {
			notesStoreState.activeFileId = id;
		},
		pushRecentFile: (id: string) => {
			notesStoreState.recentFileIds = [
				id,
				...notesStoreState.recentFileIds.filter((existing) => existing !== id),
			];
		},
		setFileSaveState: (id: string, status: "idle" | "saving" | "saved" | "error") => {
			notesStoreState.saveStates[id] = status;
		},
		clearFileSaveState: (id: string) => {
			delete notesStoreState.saveStates[id];
		},
		setFolderOpen: () => {},
		collapseAllFolders: () => {},
		expandAllFolders: () => {},
		setUIState: (updates: Partial<NotesStoreState["ui"]>) => {
			notesStoreState.ui = { ...notesStoreState.ui, ...updates };
		},
		setSidebarWidth: (sidebarWidth: number) => {
			notesStoreState.ui.sidebarWidth = sidebarWidth;
		},
		openSplitBeside: (fileId: string, primaryFileId: string) => {
			if (!fileId || fileId === primaryFileId) return;
			notesStoreState.split = {
				...notesStoreState.split,
				secondaryFileId: fileId,
				focusedPane: "secondary",
			};
		},
		setSecondaryFile: (fileId: string) => {
			if (!fileId || fileId === notesStoreState.activeFileId) return;
			notesStoreState.split = {
				...notesStoreState.split,
				secondaryFileId: fileId,
				focusedPane: "secondary",
			};
		},
		closeSplit: () => {
			notesStoreState.split = {
				...notesStoreState.split,
				secondaryFileId: null,
				focusedPane: "primary",
				secondaryFirst: false,
			};
		},
		setFocusedEditorPane: (pane: "primary" | "secondary") => {
			notesStoreState.split = { ...notesStoreState.split, focusedPane: pane };
		},
		setEditorScrollPosition: () => {},
		toggleSplitOrientation: () => {},
		swapSplitPaneOrder: () => {},
	};
}

function installMocks() {
	const reactMock = {
		useCallback: (callback: unknown) => callback,
		useEffect: () => undefined,
		useMemo: (factory: () => unknown) => factory(),
		useRef: (current: unknown) => ({ current }),
		useState: (initial: unknown) => [
			typeof initial === "function" ? (initial as () => unknown)() : initial,
			() => undefined,
		],
	};
	mock.module("react", () => ({ ...reactMock, default: reactMock }));

	mock.module("@tanstack/react-query", () => ({
		useQueryClient: () => ({
			getQueryData: () => undefined,
			prefetchQuery: () => Promise.resolve(),
			setQueryData: () => undefined,
		}),
	}));

	mock.module("next/navigation", () => ({
		useRouter: () => ({ push: () => undefined }),
		useSearchParams: () => new URLSearchParams(),
	}));

	mock.module("@remcostoeten/use-shortcut", () => ({
		useShortcut: () => ({
			setScopes: () => undefined,
			in: () => ({
				mod: {
					key: () => ({
						except: () => ({
							on: () => ({ unbind: () => undefined }),
						}),
					}),
					shift: {
						key: () => ({
							except: () => ({
								on: () => ({ unbind: () => undefined }),
							}),
						}),
					},
				},
				shift: {
					key: () => ({
						except: () => ({
							on: () => ({ unbind: () => undefined }),
						}),
					}),
				},
			}),
		}),
	}));

	mock.module("@/core/shortcuts", () => ({
		useShortcutManager: () => ({ getHelpGroups: () => [] }),
		useShortcutScope: () => undefined,
	}));

	mock.module("framer-motion", () => ({
		useDragControls: () => ({}),
		useReducedMotion: () => false,
	}));

	mock.module("@/domain/folders/actions", () => ({}));
	mock.module("@/domain/notes/actions", () => ({
		fetchNote: async (id: string) => notes.find((note) => note.id === id) ?? null,
	}));
	mock.module("@/domain/seed/actions", () => ({
		fetchGuestSeedNote: async (id: string) => notes.find((note) => note.id === id) ?? null,
	}));
	mock.module("@/domain/notes/rich-document", () => ({
		markdownToRichDocument: () => [],
	}));
	mock.module("@/core/workspace-backend", () => ({
		useIsGuestWorkspace: () => false,
		isTauriRuntime: () => false,
		useWorkspaceBackend: () => ({
			getNote: async (id: string) =>
				notes.find((note) => note.id === id) ?? null,
		}),
	}));
	mock.module("@/features/editor/lib/editor-mode", () => ({
		isMdxNote: () => false,
		resolveEditorMode: () => "block",
	}));
	mock.module("@/shared/lib/native-feedback", () => ({
		triggerNativeFeedback: () => undefined,
	}));

	mock.module("@/features/notes/hooks/use-notes", () => ({
		useNotes: () => ({ data: notes, isPending: false, isFetching: false }),
	}));
	mock.module("@/features/notes/hooks/use-folders", () => ({
		useFolders: () => ({ data: [], isPending: false }),
	}));
	mock.module("@/features/notes/hooks/use-note", () => ({
		useNote: (id: string) => ({
			data: notes.find((note) => note.id === id) ?? null,
			isPlaceholderData: false,
		}),
	}));
	mock.module("@/features/notes/hooks/use-debounced-save", () => ({
		useDebouncedSave: () => ({
			schedule: () => undefined,
			flush,
			flushAll,
			discardPending: () => undefined,
			getDirtyNoteIds: () => [],
		}),
	}));

	const mutation = { mutate: () => undefined, isPending: false };
	mock.module("@/features/notes/hooks/use-create-note", () => ({
		useCreateNote: () => mutation,
	}));
	mock.module("@/features/notes/hooks/use-create-folder", () => ({
		useCreateFolder: () => mutation,
	}));
	mock.module("@/features/notes/hooks/use-update-note", () => ({
		useUpdateNote: () => mutation,
	}));
	mock.module("@/features/notes/hooks/use-update-folder", () => ({
		useUpdateFolder: () => mutation,
	}));
	mock.module("@/features/notes/hooks/use-delete-note", () => ({
		useDeleteNote: () => mutation,
	}));
	mock.module("@/features/notes/hooks/use-delete-folder", () => ({
		useDeleteFolder: () => mutation,
	}));
	mock.module("@/features/notes/hooks/use-restore-note-version", () => ({
		useRestoreNoteVersion: () => mutation,
	}));

	mock.module("@/features/settings/store", () => ({
		usePreferencesStore: (selector: (state: any) => unknown) =>
			selector({
				initialize: () => undefined,
				editor: { defaultModeRaw: false, notePropertiesDefaultTemplateId: null, vimMode: false },
				journal: { diaryModeEnabled: false },
				appearance: { theme: "midnight", rememberLastNote: false },
			}),
	}));
	mock.module("@/features/onboarding/store", () => ({
		useOnboardingStore: Object.assign(
			(selector: (state: { resetWelcome: () => void }) => unknown) =>
				selector({ resetWelcome: () => undefined }),
			{ getState: () => ({ resetWelcome: () => undefined }) },
		),
	}));
	mock.module("@/features/notes/components/sidebar/store", () => ({
		useSidebarStore: {
			getState: () => ({ currentUserScopeId: null, syncUserScope: () => undefined }),
		},
	}));
	mock.module("@/features/notes/store", () => ({
		applyFolderUiState: (folders: unknown[]) => folders,
		useNotesStore: Object.assign(
			(selector: (state: NotesStoreState & ReturnType<typeof createStoreApi>) => unknown) =>
				selector({ ...notesStoreState, ...createStoreApi() }),
			{
				getState: () => ({ ...notesStoreState, ...createStoreApi() }),
			},
		),
	}));
	mock.module("@/features/notes/hooks/use-notes-navigation", () => ({
		clearNoteUrl: () => true,
		useFileNavigation: (files: NoteFile[], activeId: string) => {
			const index = files.findIndex((file) => file.id === activeId);
			return {
				canNavigatePrev: index > 0,
				canNavigateNext: index >= 0 && index < files.length - 1,
			};
		},
		useUrlSync: (setActiveFileId: (id: string) => void) => ({
			handleFileSelect: (id: string) => setActiveFileId(id),
		}),
	}));
}

async function renderLayout() {
	installMocks();
	const moduleId = `@/features/notes/hooks/use-notes-layout?switch-save=${Math.random()
		.toString(36)
		.slice(2)}`;
	const { useNotesLayout } = await import(moduleId);
	return useNotesLayout();
}

beforeEach(() => {
	notes = [makeNote("note-a"), makeNote("note-b"), makeNote("note-c")];
	notesStoreState = createInitialStoreState();
	flush = createMock(() => new Promise<void>(() => undefined));
	flushAll = createMock(() => new Promise<void>(() => undefined));
});

afterEach(() => {
	mock.restore();
});

describe("useNotesLayout note switching saves", () => {
	test("selects another note immediately while the previous note flush is pending", async () => {
		const layout = await renderLayout();

		layout.handleFileSelect("note-b");

		expect(notesStoreState.activeFileId).toBe("note-b");
		expect(flush).toHaveBeenCalledWith("note-a", { createCheckpoint: true });
	});

	test("next navigation updates the active note immediately while flushing the previous note", async () => {
		const layout = await renderLayout();

		layout.handleNavigateNext();

		expect(notesStoreState.activeFileId).toBe("note-b");
		expect(flush).toHaveBeenCalledWith("note-a", { createCheckpoint: true });
	});

	test("switches the focused split pane immediately while that pane flush is pending", async () => {
		notesStoreState.split = {
			...notesStoreState.split,
			secondaryFileId: "note-b",
			focusedPane: "secondary",
		};
		const layout = await renderLayout();

		layout.handleFileSelect("note-c");

		expect(notesStoreState.split.secondaryFileId).toBe("note-c");
		expect(notesStoreState.activeFileId).toBe("note-a");
		expect(flush).toHaveBeenCalledWith("note-b", { createCheckpoint: true });
	});

	test("opens a split pane immediately while flushing pending edits in the background", async () => {
		const layout = await renderLayout();

		layout.handleOpenBeside("note-b");

		expect(notesStoreState.split.secondaryFileId).toBe("note-b");
		expect(notesStoreState.split.focusedPane).toBe("secondary");
		expect(flushAll).toHaveBeenCalledWith({ createCheckpoint: true });
	});
});
