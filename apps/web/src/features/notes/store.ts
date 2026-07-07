import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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

export type WorkspaceTab = {
	fileId: string;
	pinned: boolean;
};

type SplitEditorState = {
	secondaryFileId: string | null;
	focusedPane: EditorPane;
	scrollPositions: Record<string, number>;
	orientation: SplitOrientation;
	secondaryFirst: boolean;
};

/**
 * Pinned tabs always sort ahead of unpinned ones while preserving the relative
 * order within each group. This is the single invariant every tab mutation
 * re-applies, so the rendered order always equals the stored array order.
 */
function sortPinnedFirst(tabs: WorkspaceTab[]): WorkspaceTab[] {
	const pinned = tabs.filter((tab) => tab.pinned);
	const unpinned = tabs.filter((tab) => !tab.pinned);
	return [...pinned, ...unpinned];
}

export type NoteLinkReturn = {
	fromId: string;
	toId: string;
};

type NotesUiState = {
	activeFileId: string;
	lastActiveFileId: string;
	noteLinkReturn: NoteLinkReturn | null;
	setNoteLinkReturn: (returnTo: NoteLinkReturn | null) => void;
	isHydrated: boolean;
	folderOpenState: FolderOpenState;
	saveStates: Record<string, SaveStatus>;
	recentFileIds: string[];
	pushRecentFile: (id: string) => void;
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
	setSplitSecondaryFirst: (secondaryFirst: boolean) => void;
	primaryTabs: WorkspaceTab[];
	secondaryTabs: WorkspaceTab[];
	tabsHydrated: boolean;
	addTab: (pane: EditorPane, fileId: string) => void;
	openTabInBackground: (pane: EditorPane, fileId: string) => void;
	removeTab: (pane: EditorPane, fileId: string) => void;
	reorderTabs: (pane: EditorPane, orderedFileIds: string[]) => void;
	togglePinTab: (pane: EditorPane, fileId: string) => void;
	setPaneTabs: (pane: EditorPane, tabs: WorkspaceTab[]) => void;
	closeOtherTabs: (pane: EditorPane, fileId: string) => string[];
	closeTabsToSide: (pane: EditorPane, fileId: string, side: "left" | "right") => string[];
	closeAllTabs: (pane: EditorPane) => string[];
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

const RECENT_FILES_LIMIT = 12;

const TAB_KEY_BY_PANE: Record<EditorPane, "primaryTabs" | "secondaryTabs"> = {
	primary: "primaryTabs",
	secondary: "secondaryTabs",
};

function paneTabsPatch(pane: EditorPane, tabs: WorkspaceTab[]): Partial<NotesUiState> {
	return pane === "primary" ? { primaryTabs: tabs } : { secondaryTabs: tabs };
}

export const useNotesStore = create<NotesUiState>()(
	persist(
		(set, get) => ({
			activeFileId: "",
			lastActiveFileId: "",
			noteLinkReturn: null,
			isHydrated: false,
			folderOpenState: {},
			saveStates: {},
			recentFileIds: [],
			split: INITIAL_SPLIT_STATE,
			primaryTabs: [],
			secondaryTabs: [],
			tabsHydrated: false,
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
					noteLinkReturn: null,
					split: INITIAL_SPLIT_STATE,
					primaryTabs: [],
					secondaryTabs: [],
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
				set(id ? { activeFileId: id, lastActiveFileId: id } : { activeFileId: id });
			},

			setNoteLinkReturn: (returnTo) => {
				set({ noteLinkReturn: returnTo });
			},

			pushRecentFile: (id) => {
				if (!id) return;
				set((state) => {
					if (state.recentFileIds[0] === id) return state;
					const next = [id, ...state.recentFileIds.filter((existing) => existing !== id)];
					return { recentFileIds: next.slice(0, RECENT_FILES_LIMIT) };
				});
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
					secondaryTabs: [],
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
						orientation:
							state.split.orientation === "vertical" ? "horizontal" : "vertical",
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

			setSplitSecondaryFirst: (secondaryFirst) => {
				set((state) => ({
					split: { ...state.split, secondaryFirst },
				}));
			},

			addTab: (pane, fileId) => {
				if (!fileId) return;
				const key = TAB_KEY_BY_PANE[pane];
				set((state) => {
					if (state[key].some((tab) => tab.fileId === fileId)) return state;
					return paneTabsPatch(
						pane,
						sortPinnedFirst([...state[key], { fileId, pinned: false }]),
					);
				});
			},

			openTabInBackground: (pane, fileId) => {
				if (!fileId) return;
				const key = TAB_KEY_BY_PANE[pane];
				set((state) => {
					const activeId =
						pane === "secondary" ? state.split.secondaryFileId : state.activeFileId;
					const next = [...state[key]];
					let changed = false;
					if (
						activeId &&
						activeId !== fileId &&
						!next.some((tab) => tab.fileId === activeId)
					) {
						next.push({ fileId: activeId, pinned: false });
						changed = true;
					}
					if (!next.some((tab) => tab.fileId === fileId)) {
						next.push({ fileId, pinned: false });
						changed = true;
					}
					if (!changed) return state;
					return paneTabsPatch(pane, sortPinnedFirst(next));
				});
			},

			removeTab: (pane, fileId) => {
				const key = TAB_KEY_BY_PANE[pane];
				set((state) => {
					if (!state[key].some((tab) => tab.fileId === fileId)) return state;
					return paneTabsPatch(
						pane,
						state[key].filter((tab) => tab.fileId !== fileId),
					);
				});
			},

			reorderTabs: (pane, orderedFileIds) => {
				const key = TAB_KEY_BY_PANE[pane];
				set((state) => {
					const byId = new Map(state[key].map((tab) => [tab.fileId, tab]));
					const reordered = orderedFileIds
						.map((id) => byId.get(id))
						.filter((tab): tab is WorkspaceTab => Boolean(tab));
					const orderedIdSet = new Set(orderedFileIds);
					for (const tab of state[key]) {
						if (!orderedIdSet.has(tab.fileId)) reordered.push(tab);
					}
					return paneTabsPatch(pane, sortPinnedFirst(reordered));
				});
			},

			togglePinTab: (pane, fileId) => {
				const key = TAB_KEY_BY_PANE[pane];
				set((state) =>
					paneTabsPatch(
						pane,
						sortPinnedFirst(
							state[key].map((tab) =>
								tab.fileId === fileId ? { ...tab, pinned: !tab.pinned } : tab,
							),
						),
					),
				);
			},

			setPaneTabs: (pane, tabs) => {
				set(paneTabsPatch(pane, sortPinnedFirst(tabs)));
			},

			closeOtherTabs: (pane, fileId) => {
				const key = TAB_KEY_BY_PANE[pane];
				const removed = get()[key].reduce<string[]>((acc, tab) => {
					if (tab.fileId !== fileId && !tab.pinned) acc.push(tab.fileId);
					return acc;
				}, []);
				set((state) =>
					paneTabsPatch(
						pane,
						state[key].filter((tab) => tab.fileId === fileId || tab.pinned),
					),
				);
				return removed;
			},

			closeTabsToSide: (pane, fileId, side) => {
				const key = TAB_KEY_BY_PANE[pane];
				const tabs = get()[key];
				const anchorIndex = tabs.findIndex((tab) => tab.fileId === fileId);
				if (anchorIndex === -1) return [];
				const shouldKeep = (index: number, tab: WorkspaceTab) => {
					if (tab.pinned || tab.fileId === fileId) return true;
					return side === "right" ? index <= anchorIndex : index >= anchorIndex;
				};
				const removed = tabs.reduce<string[]>((acc, tab, index) => {
					if (!shouldKeep(index, tab)) acc.push(tab.fileId);
					return acc;
				}, []);
				set((state) =>
					paneTabsPatch(
						pane,
						state[key].filter((tab, index) => shouldKeep(index, tab)),
					),
				);
				return removed;
			},

			closeAllTabs: (pane) => {
				const key = TAB_KEY_BY_PANE[pane];
				const removed = get()[key].reduce<string[]>((acc, tab) => {
					if (!tab.pinned) acc.push(tab.fileId);
					return acc;
				}, []);
				set((state) =>
					paneTabsPatch(
						pane,
						state[key].filter((tab) => tab.pinned),
					),
				);
				return removed;
			},
		}),
		{
			name: "notes-workspace-tabs",
			version: 1,
			// Throwing when storage is missing makes createJSONStorage bail and
			// persist no-op, which keeps SSR and unit tests (no localStorage)
			// working instead of crashing on the first write.
			storage: createJSONStorage(() => {
				if (typeof localStorage === "undefined") {
					throw new Error("localStorage is unavailable");
				}
				return localStorage;
			}),
			partialize: (state) => ({
				primaryTabs: state.primaryTabs,
				secondaryTabs: state.secondaryTabs,
				recentFileIds: state.recentFileIds,
				lastActiveFileId: state.lastActiveFileId,
			}),
			onRehydrateStorage: () => (state) => {
				if (state) state.tabsHydrated = true;
			},
		},
	),
);
