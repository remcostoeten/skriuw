import { create } from "zustand";
type SaveStatus = "idle" | "saving" | "saved" | "error";
import type { NoteFile, NoteFolder } from "@/types/notes";
import { DESKTOP_METADATA_MIN_WIDTH, DESKTOP_SIDEBAR_MIN_WIDTH } from "./constants";

type FolderOpenState = Record<string, boolean>;

type LayoutUiState = {
	isMobile: boolean;
	showSidebar: boolean;
	showMetadata: boolean;
	sidebarWidth: number;
	metadataWidth: number;
	selectedInspectorTag: string | null;
};

export type EditorPane = "primary" | "secondary";

export type SplitOrientation = "vertical" | "horizontal";

type SplitEditorState = {
	secondaryFileId: string | null;
	focusedPane: EditorPane;
	scrollPositions: Record<string, number>;
	orientation: SplitOrientation;
	secondaryFirst: boolean;
};

type NotesUiState = {
	activeFileId: string;
	isHydrated: boolean;
	folderOpenState: FolderOpenState;
	saveStates: Record<string, SaveStatus>;
	resetUi: () => void;
	initialize: () => Promise<void>;
	getFileSaveState: (id: string | null | undefined) => SaveStatus;
	setActiveFileId: (id: string) => void;
	ensureActiveFileId: (files: NoteFile[]) => void;
	setFileSaveState: (id: string, status: SaveStatus) => void;
	clearFileSaveState: (id: string) => void;
	toggleFolder: (id: string) => void;
	setFolderOpen: (id: string, isOpen: boolean) => void;
	collapseAllFolders: (folderIds: string[]) => void;
	expandAllFolders: (folderIds: string[]) => void;
	ui: LayoutUiState;
	setUIState: (updates: Partial<LayoutUiState>) => void;
	setSelectedInspectorTag: (tag: string | null) => void;
	setSidebarWidth: (width: number) => void;
	setMetadataWidth: (width: number) => void;
	split: SplitEditorState;
	openSplitBeside: (fileId: string, primaryFileId: string) => void;
	setSecondaryFile: (fileId: string) => void;
	closeSplit: () => void;
	setFocusedEditorPane: (pane: EditorPane) => void;
	setEditorScrollPosition: (fileId: string, scrollTop: number) => void;
	setSplitOrientation: (orientation: SplitOrientation) => void;
	toggleSplitOrientation: () => void;
	swapSplitPaneOrder: () => void;
};

export function applyFolderUiState(
	folders: NoteFolder[],
	folderOpenState: FolderOpenState,
): NoteFolder[] {
	return folders.map((folder) => ({
		...folder,
		isOpen: folderOpenState[folder.id] ?? true,
	}));
}

const INITIAL_SPLIT_STATE: SplitEditorState = {
	secondaryFileId: null,
	focusedPane: "primary",
	scrollPositions: {},
	orientation: "vertical",
	secondaryFirst: false,
};

export const useNotesStore = create<NotesUiState>()((set, get) => ({
	activeFileId: "",
	isHydrated: false,
	folderOpenState: {},
	saveStates: {},
	split: INITIAL_SPLIT_STATE,
	ui: {
		isMobile: false,
		showSidebar: true,
		showMetadata: true,
		sidebarWidth: DESKTOP_SIDEBAR_MIN_WIDTH,
		metadataWidth: DESKTOP_METADATA_MIN_WIDTH,
		selectedInspectorTag: null,
	},

	resetUi: () => {
		set({
			activeFileId: "",
			isHydrated: false,
			folderOpenState: {},
			saveStates: {},
			split: INITIAL_SPLIT_STATE,
			ui: {
				isMobile: false,
				showSidebar: true,
				showMetadata: true,
				sidebarWidth: DESKTOP_SIDEBAR_MIN_WIDTH,
				metadataWidth: DESKTOP_METADATA_MIN_WIDTH,
				selectedInspectorTag: null,
			},
		});
	},

	initialize: async () => {
		if (get().isHydrated) {
			return;
		}

		set({ isHydrated: true });
	},

	getFileSaveState: (id) => {
		if (!id) return "idle";
		return get().saveStates[id] ?? "idle";
	},

	setActiveFileId: (id) => {
		set({ activeFileId: id });
	},

	ensureActiveFileId: (files) => {
		set((state) => {
			if (files.length === 0) {
				return state.activeFileId ? { activeFileId: "" } : state;
			}

			if (files.some((file) => file.id === state.activeFileId)) {
				return state;
			}

			return { activeFileId: files[0]?.id ?? "" };
		});
	},

	setFileSaveState: (id, status) => {
		set((state) => ({
			saveStates: { ...state.saveStates, [id]: status },
		}));
	},

	clearFileSaveState: (id) => {
		set((state) => ({
			saveStates: Object.fromEntries(
				Object.entries(state.saveStates).filter(([key]) => key !== id),
			),
		}));
	},

	toggleFolder: (id) => {
		set((state) => ({
			folderOpenState: {
				...state.folderOpenState,
				[id]: !(state.folderOpenState[id] ?? true),
			},
		}));
	},

	setFolderOpen: (id, isOpen) => {
		set((state) => ({
			folderOpenState: { ...state.folderOpenState, [id]: isOpen },
		}));
	},

	collapseAllFolders: (folderIds) => {
		set((state) => ({
			folderOpenState: {
				...state.folderOpenState,
				...Object.fromEntries(folderIds.map((folderId) => [folderId, false])),
			},
		}));
	},

	expandAllFolders: (folderIds) => {
		set((state) => ({
			folderOpenState: {
				...state.folderOpenState,
				...Object.fromEntries(folderIds.map((folderId) => [folderId, true])),
			},
		}));
	},

	setUIState: (updates) => {
		set((state) => ({
			ui: { ...state.ui, ...updates },
		}));
	},

	setSelectedInspectorTag: (tag) => {
		set((state) => ({
			ui: { ...state.ui, selectedInspectorTag: tag },
		}));
	},

	setSidebarWidth: (width) => {
		set((state) => ({
			ui: { ...state.ui, sidebarWidth: width },
		}));
	},

	setMetadataWidth: (width) => {
		set((state) => ({
			ui: { ...state.ui, metadataWidth: width },
		}));
	},

	openSplitBeside: (fileId, primaryFileId) => {
		if (!fileId || fileId === primaryFileId) return;
		set((state) => ({
			split: {
				...state.split,
				secondaryFileId: fileId,
				focusedPane: "secondary",
			},
		}));
	},

	setSecondaryFile: (fileId) => {
		const primaryFileId = get().activeFileId;
		if (!fileId || fileId === primaryFileId) return;
		set((state) => ({
			split: {
				...state.split,
				secondaryFileId: fileId,
				focusedPane: "secondary",
			},
		}));
	},

	closeSplit: () => {
		set((state) => ({
			split: {
				...state.split,
				secondaryFileId: null,
				focusedPane: "primary",
				secondaryFirst: false,
			},
		}));
	},

	setFocusedEditorPane: (pane) => {
		set((state) => ({
			split: { ...state.split, focusedPane: pane },
		}));
	},

	setEditorScrollPosition: (fileId, scrollTop) => {
		if (!fileId) return;
		set((state) => {
			if (state.split.scrollPositions[fileId] === scrollTop) return state;
			return {
				split: {
					...state.split,
					scrollPositions: {
						...state.split.scrollPositions,
						[fileId]: scrollTop,
					},
				},
			};
		});
	},

	setSplitOrientation: (orientation) => {
		set((state) => ({
			split: { ...state.split, orientation },
		}));
	},

	toggleSplitOrientation: () => {
		set((state) => ({
			split: {
				...state.split,
				orientation: state.split.orientation === "vertical" ? "horizontal" : "vertical",
			},
		}));
	},

	swapSplitPaneOrder: () => {
		set((state) => ({
			split: {
				...state.split,
				secondaryFirst: !state.split.secondaryFirst,
			},
		}));
	},
}));
