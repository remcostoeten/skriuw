import { mock } from "bun:test";
import { createElement } from "react";
import type { NoteFile } from "@/types/notes";

type MockFn = (...args: any[]) => any;
const createMock = mock as unknown as (implementation: MockFn) => MockFn & {
	mock: { calls: unknown[][] };
};

export type NotesStoreState = {
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

export function makeNote(id: string): NoteFile {
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

export function createInitialStoreState(): NotesStoreState {
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

export function createStoreApi(notesStoreState: NotesStoreState) {
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

export async function installNotesLayoutMocks(
	notes: NoteFile[],
	notesStoreState: NotesStoreState,
	flush: ReturnType<typeof createMock>,
	flushAll: ReturnType<typeof createMock>,
) {
	const actualReact = await import("react");
	const reactMock = {
		...actualReact,
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
		useQuery: () => ({ data: undefined, isPending: false, isFetching: false }),
		useMutation: (options: any) => options,
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
		useShortcutHint: () => "",
		ShortcutProvider: ({ children }: { children?: unknown }) => children,
	}));

	mock.module("@/core/commands", () => ({
		useCommandRegistry: () => ({
			isOpen: false,
			setIsOpen: () => undefined,
			toggleOpen: () => undefined,
			executeCommand: () => undefined,
			registerHandlers: () => () => undefined,
			registerItemsProvider: () => () => undefined,
			pushActiveScope: () => () => undefined,
			query: "",
			setQuery: () => undefined,
		}),
		useRegisterCommands: () => undefined,
		useRegisterCommandItemsProvider: () => undefined,
		useActiveCommandScope: () => undefined,
	}));

	mock.module("framer-motion", () => {
		const MOTION_ONLY_PROPS = new Set([
			"initial",
			"animate",
			"exit",
			"transition",
			"variants",
			"whileHover",
			"whileTap",
			"whileFocus",
			"whileInView",
			"whileDrag",
			"drag",
			"dragControls",
			"dragConstraints",
			"dragElastic",
			"dragMomentum",
			"layout",
			"layoutId",
			"onAnimationComplete",
			"onAnimationStart",
			"onDragEnd",
			"custom",
		]);
		const stripMotionProps = (props: Record<string, unknown>) => {
			const rest: Record<string, unknown> = {};
			for (const key in props) {
				if (!MOTION_ONLY_PROPS.has(key)) rest[key] = props[key];
			}
			return rest;
		};
		const m = new Proxy(
			{},
			{
				get:
					(_target, tag: string) =>
					({ ref, ...props }: Record<string, unknown> & { ref?: unknown }) =>
						createElement(tag, { ...stripMotionProps(props), ref }),
			},
		);
		const passthrough = ({ children }: { children?: unknown }) => children;
		return {
			m,
			motion: m,
			AnimatePresence: passthrough,
			LazyMotion: passthrough,
			MotionConfig: passthrough,
			domAnimation: {},
			domMin: {},
			stagger: () => 0,
			useAnimate: () => [{ current: null }, async () => undefined],
			useAnimation: () => ({
				start: async () => undefined,
				stop: () => undefined,
				set: () => undefined,
			}),
			useDragControls: () => ({}),
			useReducedMotion: () => false,
		};
	});

	mock.module("@/domain/folders/actions", () => ({}));
	mock.module("@/domain/notes/actions", () => ({
		fetchNote: async (id: string) => notes.find((note) => note.id === id) ?? null,
	}));
	mock.module("@/domain/seed/actions", () => ({
		fetchGuestSeedNote: async (id: string) => notes.find((note) => note.id === id) ?? null,
	}));
	mock.module("@/domain/notes/rich-document", () => ({
		markdownToRichDocument: () => [],
		richDocumentKey: () => "",
	}));
	mock.module("@/core/workspace-backend", () => ({
		useIsGuestWorkspace: () => false,
		useWorkspaceCapabilities: () => ({}),
		isTauriRuntime: () => false,
		createTauriBackend: () => ({}),
		tauriInvoke: async () => undefined,
		tauriChannel: () => ({}),
		useWorkspaceBackend: () => ({
			getNote: async (id: string) => notes.find((note) => note.id === id) ?? null,
		}),
		WorkspaceBackendProvider: ({ children }: { children?: unknown }) => children,
		WorkspaceCapabilityError: class WorkspaceCapabilityError extends Error {},
		serverBackend: {},
		createLocalBackend: () => ({}),
		mergeSeedWithGuestNotes: (notes: unknown) => notes,
		mergeSeedWithGuestFolders: (folders: unknown) => folders,
		mergeSeedWithGuestWorkspace: async (workspaceNotes: unknown, folders: unknown) => ({
			notes: workspaceNotes,
			folders,
		}),
		resetGuestStorage: () => undefined,
		GUEST_SIGNUP_PROMPT_EVENT: "guest-signup-prompt",
		recordGuestGraphExplore: () => undefined,
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
				editor: {
					defaultModeRaw: false,
					notePropertiesDefaultTemplateId: null,
					vimMode: false,
				},
				journal: { diaryModeEnabled: false },
				appearance: { theme: "midnight", rememberLastNote: false },
			}),
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
				selector({ ...notesStoreState, ...createStoreApi(notesStoreState) }),
			{
				getState: () => ({ ...notesStoreState, ...createStoreApi(notesStoreState) }),
			},
		),
	}));
	mock.module("@/features/notes/hooks/use-notes-navigation", () => ({
		clearNoteUrl: () => true,
		updateNoteUrl: () => true,
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

export async function renderNotesLayout() {
	const moduleId = `@/features/notes/hooks/use-notes-layout?switch-save=${Math.random()
		.toString(36)
		.slice(2)}`;
	const { useNotesLayout } = await import(moduleId);
	return useNotesLayout();
}
