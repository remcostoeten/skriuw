"use client";

import {
	memo,
	useCallback,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { EditorContainer } from "@/features/editor/components/editor-container";
import { EditorToolbar } from "@/features/editor/components/editor-toolbar";
import type {
	EditorSaveState,
	WorkspaceNavItem,
} from "@/features/editor/components/editor-toolbar";
import { stripMarkdownExtension } from "@/domain/notes/note-links";
import { useNotesStore, type EditorPane, type SplitOrientation } from "@/features/notes/store";
import { goto, useGotoTarget } from "@/core/quick-access";
import { cn } from "@/shared/lib/utils";
import type { NoteFile, NoteEditorMode, RichTextDocument } from "@/types/notes";
import type { NoteProperty } from "@/domain/notes/properties";
import { TabBar, type WorkspaceTabBarApi } from "./editor-tabs/tab-bar";

type EditorWorkspaceProps = {
	splitActive: boolean;
	primaryFile: NoteFile | null;
	secondaryFile: NoteFile | null;
	files: NoteFile[];
	focusedPane: EditorPane;
	editorMode: "raw" | "block";
	secondaryEditorMode: "raw" | "block";
	orientation: SplitOrientation;
	secondaryFirst: boolean;
	isMobile: boolean;
	canNavigatePrev: boolean;
	canNavigateNext: boolean;
	canToggleSplit: boolean;
	primaryFileName: string;
	primarySaveState?: EditorSaveState;
	primaryContentLoading: boolean;
	onToggleSidebar: () => void;
	onToggleMetadata: () => void;
	workspaceItems?: WorkspaceNavItem[];
	onOpenSettings?: () => void;
	onNavigatePrev: () => void;
	onNavigateNext: () => void;
	onToggleSplit: () => void;
	onToggleEditorMode?: () => void;
	onToggleSplitOrientation: () => void;
	onSwapPaneOrder: () => void;
	onCloseSplit: () => void;
	onFocusPane: (pane: EditorPane) => void;
	onScrollPositionChange: (fileId: string, scrollTop: number) => void;
	onContentChange: (
		id: string,
		content: string,
		options?: {
			richContent?: RichTextDocument;
			preferredEditorMode?: NoteEditorMode;
			properties?: NoteProperty[];
		},
	) => void;
	onCreateFile?: () => void;
	onRenameFile?: (id: string, name: string) => void;
	onEditorBlur?: (fileId: string) => void;
	tabBar?: WorkspaceTabBarApi;
};

const SNAP_RATIO = 0.32;

type PaneConfig = {
	pane: EditorPane;
	file: NoteFile | null;
	editorMode: "raw" | "block";
	showClose: boolean;
};

function paneLabel(file: NoteFile | null) {
	return file ? stripMarkdownExtension(file.name).replace(/-/g, " ") : "Empty pane";
}

type WorkspacePaneProps = {
	pane: EditorPane;
	file: NoteFile | null;
	paneEditorMode: "raw" | "block";
	showClose: boolean;
	isPrimary: boolean;
	isDragging: boolean;
	translate: number;
	isVertical: boolean;
	splitActive: boolean;
	focusedPane: EditorPane;
	editorGotoRef: (element: HTMLElement | null) => void;
	files: NoteFile[];
	isMobile: boolean;
	primaryFileName: string;
	primarySaveState?: EditorSaveState;
	primaryContentLoading: boolean;
	workspaceItems?: WorkspaceNavItem[];
	onOpenSettings?: () => void;
	onCreateFile?: () => void;
	onRenameFile?: (id: string, name: string) => void;
	onContentChange: EditorWorkspaceProps["onContentChange"];
	onToggleSidebar: () => void;
	onToggleMetadata: () => void;
	onNavigatePrev: () => void;
	onNavigateNext: () => void;
	canNavigatePrev: boolean;
	canNavigateNext: boolean;
	onToggleSplit: () => void;
	canToggleSplit: boolean;
	onToggleEditorMode?: () => void;
	onCloseSplit: () => void;
	onFocusPane: (pane: EditorPane) => void;
	onEditorBlur?: (fileId: string) => void;
	onScrollPositionChange: (fileId: string, scrollTop: number) => void;
	tabBar?: WorkspaceTabBarApi;
	onDragStart: (pane: EditorPane) => (event: ReactPointerEvent<HTMLButtonElement>) => void;
	onDragMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
	onDragEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

function WorkspacePane({
	pane,
	file,
	paneEditorMode,
	showClose,
	isPrimary,
	isDragging,
	translate,
	isVertical,
	splitActive,
	focusedPane,
	editorGotoRef,
	files,
	isMobile,
	primaryFileName,
	primarySaveState,
	primaryContentLoading,
	workspaceItems,
	onOpenSettings,
	onCreateFile,
	onRenameFile,
	onContentChange,
	onToggleSidebar,
	onToggleMetadata,
	onNavigatePrev,
	onNavigateNext,
	canNavigatePrev,
	canNavigateNext,
	onToggleSplit,
	canToggleSplit,
	onToggleEditorMode,
	onCloseSplit,
	onFocusPane,
	onEditorBlur,
	onScrollPositionChange,
	tabBar,
	onDragStart,
	onDragMove,
	onDragEnd,
}: WorkspacePaneProps) {
	const paneTabItems = pane === "primary" ? tabBar?.primaryTabItems : tabBar?.secondaryTabItems;

	const handleEditorBlur = useCallback(() => {
		if (file) onEditorBlur?.(file.id);
	}, [file, onEditorBlur]);

	const handlePaneActivate = useCallback(() => {
		onFocusPane(pane);
	}, [onFocusPane, pane]);

	const handleScrollPositionChange = useCallback(
		(scrollTop: number) => {
			if (file) onScrollPositionChange(file.id, scrollTop);
		},
		[file, onScrollPositionChange],
	);

	const handleTabSelect = useCallback(
		(id: string) => tabBar?.onSelectTab(pane, id),
		[tabBar, pane],
	);
	const handleTabClose = useCallback(
		(id: string) => tabBar?.onCloseTab(pane, id),
		[tabBar, pane],
	);
	const handleTabReorder = useCallback(
		(ids: string[]) => tabBar?.onReorderTabs(pane, ids),
		[tabBar, pane],
	);
	const handleTabTogglePin = useCallback(
		(id: string) => tabBar?.onTogglePinTab(pane, id),
		[tabBar, pane],
	);
	const handleTabCloseOthers = useCallback(
		(id: string) => tabBar?.onCloseOtherTabs(pane, id),
		[tabBar, pane],
	);
	const handleTabCloseToSide = useCallback(
		(id: string, side: "left" | "right") => tabBar?.onCloseTabsToSide(pane, id, side),
		[tabBar, pane],
	);
	const handleTabDropNote = useCallback(
		(targetId: string | null, droppedId: string) =>
			tabBar?.onDropNoteOnTab(pane, targetId, droppedId),
		[tabBar, pane],
	);
	const handleTabActivatePane = useCallback(() => onFocusPane(pane), [onFocusPane, pane]);

	const handlePaneDragStart = useMemo(() => onDragStart(pane), [onDragStart, pane]);

	return (
		<div
			ref={isPrimary ? editorGotoRef : undefined}
			data-editor-pane={pane}
			className={cn("flex min-h-0 min-w-0 flex-1 flex-col", isDragging && "z-10")}
			style={{
				transform: isVertical ? `translateX(${translate}px)` : `translateY(${translate}px)`,
				transition: isDragging
					? undefined
					: "transform 180ms cubic-bezier(0.23, 1, 0.32, 1)",
			}}
		>
			{tabBar?.openInTabs && paneTabItems ? (
				<TabBar
					tabs={paneTabItems}
					activeFileId={file?.id ?? null}
					isPaneFocused={splitActive ? focusedPane === pane : undefined}
					onSelect={handleTabSelect}
					onClose={handleTabClose}
					onReorder={handleTabReorder}
					onTogglePin={handleTabTogglePin}
					onCloseOthers={handleTabCloseOthers}
					onCloseToSide={handleTabCloseToSide}
					onDropNote={handleTabDropNote}
					onActivatePane={splitActive ? handleTabActivatePane : undefined}
				/>
			) : null}
			<EditorContainer
				variant={splitActive ? "pane" : "standalone"}
				file={file}
				files={files}
				editorMode={paneEditorMode}
				isMobile={isMobile}
				onContentChange={onContentChange}
				onToggleSidebar={onToggleSidebar}
				onToggleMetadata={onToggleMetadata}
				onNavigatePrev={onNavigatePrev}
				onNavigateNext={onNavigateNext}
				canNavigatePrev={canNavigatePrev}
				canNavigateNext={canNavigateNext}
				fileName={isPrimary ? primaryFileName : file?.name || ""}
				saveState={isPrimary ? primarySaveState : undefined}
				isContentLoading={isPrimary ? primaryContentLoading : false}
				workspaceItems={!splitActive ? workspaceItems : undefined}
				onOpenSettings={!splitActive ? onOpenSettings : undefined}
				onCreateFile={!splitActive ? onCreateFile : undefined}
				onToggleSplit={onToggleSplit}
				canToggleSplit={canToggleSplit}
				splitEnabled={splitActive}
				onRenameFile={onRenameFile}
				onEditorBlur={file ? handleEditorBlur : undefined}
				isPaneFocused={splitActive ? focusedPane === pane : undefined}
				onPaneActivate={splitActive ? handlePaneActivate : undefined}
				paneLabel={splitActive ? paneLabel(file) : undefined}
				onToggleEditorMode={onToggleEditorMode}
				onClosePane={splitActive && showClose ? onCloseSplit : undefined}
				onPaneDragHandlePointerDown={splitActive ? handlePaneDragStart : undefined}
				onPaneDragHandlePointerMove={splitActive && isDragging ? onDragMove : undefined}
				onPaneDragHandlePointerUp={splitActive && isDragging ? onDragEnd : undefined}
				isPaneDragging={splitActive && isDragging}
				// Non-reactive read: subscribing to scrollPositions would
				// re-render the whole workspace on every scroll frame, and
				// the editor only consumes this on file switch.
				initialScrollTop={
					file ? (useNotesStore.getState().split.scrollPositions[file.id] ?? 0) : 0
				}
				onScrollPositionChange={handleScrollPositionChange}
			/>
		</div>
	);
}

export const EditorWorkspace = memo(function EditorWorkspace({
	splitActive,
	primaryFile,
	secondaryFile,
	files,
	focusedPane,
	editorMode,
	secondaryEditorMode,
	orientation,
	secondaryFirst,
	isMobile,
	canNavigatePrev,
	canNavigateNext,
	canToggleSplit,
	primaryFileName,
	primarySaveState,
	primaryContentLoading,
	onToggleSidebar,
	onToggleMetadata,
	workspaceItems,
	onOpenSettings,
	onNavigatePrev,
	onNavigateNext,
	onToggleSplit,
	onToggleEditorMode,
	onToggleSplitOrientation,
	onSwapPaneOrder,
	onCloseSplit,
	onFocusPane,
	onScrollPositionChange,
	onContentChange,
	onCreateFile,
	onRenameFile,
	onEditorBlur,
	tabBar,
}: EditorWorkspaceProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const editorGotoRef = useGotoTarget({ keybind: "e", to: goto.focus.editor });
	const dragStartRef = useRef(0);
	const [draggingPane, setDraggingPane] = useState<EditorPane | null>(null);
	const [dragOffset, setDragOffset] = useState(0);

	const isVertical = orientation === "vertical";
	const focusedFile = focusedPane === "secondary" ? secondaryFile : primaryFile;
	const focusedFileName = focusedFile?.name || "No file selected";
	const focusedSaveState = useNotesStore(
		(state) => state.saveStates[focusedFile?.id ?? ""] ?? "idle",
	);

	const primaryPane: PaneConfig = {
		pane: "primary",
		file: primaryFile,
		editorMode,
		showClose: false,
	};
	const secondaryPane: PaneConfig = {
		pane: "secondary",
		file: secondaryFile,
		editorMode: secondaryEditorMode,
		showClose: true,
	};

	const panes: PaneConfig[] = !splitActive
		? [primaryPane]
		: secondaryFirst
			? [secondaryPane, primaryPane]
			: [primaryPane, secondaryPane];

	const finishDrag = useCallback(
		(releaseTarget?: HTMLButtonElement | null, pointerId?: number) => {
			if (draggingPane && containerRef.current) {
				const containerSize = isVertical
					? containerRef.current.offsetWidth
					: containerRef.current.offsetHeight;
				if (Math.abs(dragOffset) > containerSize * SNAP_RATIO) {
					onSwapPaneOrder();
				}
			}

			setDraggingPane(null);
			setDragOffset(0);

			if (
				releaseTarget &&
				pointerId !== undefined &&
				releaseTarget.hasPointerCapture(pointerId)
			) {
				releaseTarget.releasePointerCapture(pointerId);
			}
		},
		[dragOffset, draggingPane, isVertical, onSwapPaneOrder],
	);

	const handleDragStart = useCallback(
		(pane: EditorPane) => (event: ReactPointerEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			event.currentTarget.setPointerCapture(event.pointerId);
			dragStartRef.current = isVertical ? event.clientX : event.clientY;
			setDraggingPane(pane);
			setDragOffset(0);
		},
		[isVertical],
	);

	const handleDragMove = useCallback(
		(event: ReactPointerEvent<HTMLButtonElement>) => {
			if (!draggingPane) return;
			const current = isVertical ? event.clientX : event.clientY;
			setDragOffset(current - dragStartRef.current);
		},
		[draggingPane, isVertical],
	);

	const handleDragEnd = useCallback(
		(event: ReactPointerEvent<HTMLButtonElement>) => {
			finishDrag(event.currentTarget, event.pointerId);
		},
		[finishDrag],
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			{splitActive ? (
				<EditorToolbar
					key="split-toolbar"
					fileName={focusedFileName}
					fileIcon={focusedFile?.icon}
					saveState={focusedSaveState}
					isMobile={isMobile}
					workspaceItems={workspaceItems}
					onToggleSidebar={onToggleSidebar}
					onToggleMetadata={onToggleMetadata}
					onOpenSettings={onOpenSettings}
					onNavigatePrev={onNavigatePrev}
					onNavigateNext={onNavigateNext}
					canNavigatePrev={canNavigatePrev}
					canNavigateNext={canNavigateNext}
					splitEnabled
					onToggleSplit={onToggleSplit}
					canToggleSplit
					splitOrientation={orientation}
					onToggleSplitOrientation={onToggleSplitOrientation}
				/>
			) : null}
			<div
				key="panes"
				ref={containerRef}
				className={cn(
					"relative flex min-h-0 flex-1",
					splitActive
						? isVertical
							? "flex-row divide-x divide-border"
							: "flex-col divide-y divide-border"
						: "flex-col",
				)}
			>
				{panes.map(({ pane, file, editorMode: paneEditorMode, showClose }) => {
					const isPrimary = pane === "primary";
					const isDragging = draggingPane === pane;
					const translate = isDragging ? dragOffset : 0;

					return (
						<WorkspacePane
							key={pane}
							pane={pane}
							file={file}
							paneEditorMode={paneEditorMode}
							showClose={showClose}
							isPrimary={isPrimary}
							isDragging={isDragging}
							translate={translate}
							isVertical={isVertical}
							splitActive={splitActive}
							focusedPane={focusedPane}
							editorGotoRef={editorGotoRef}
							files={files}
							isMobile={isMobile}
							primaryFileName={primaryFileName}
							primarySaveState={primarySaveState}
							primaryContentLoading={primaryContentLoading}
							workspaceItems={workspaceItems}
							onOpenSettings={onOpenSettings}
							onCreateFile={onCreateFile}
							onRenameFile={onRenameFile}
							onContentChange={onContentChange}
							onToggleSidebar={onToggleSidebar}
							onToggleMetadata={onToggleMetadata}
							onNavigatePrev={onNavigatePrev}
							onNavigateNext={onNavigateNext}
							canNavigatePrev={canNavigatePrev}
							canNavigateNext={canNavigateNext}
							onToggleSplit={onToggleSplit}
							canToggleSplit={canToggleSplit}
							onToggleEditorMode={onToggleEditorMode}
							onCloseSplit={onCloseSplit}
							onFocusPane={onFocusPane}
							onEditorBlur={onEditorBlur}
							onScrollPositionChange={onScrollPositionChange}
							tabBar={tabBar}
							onDragStart={handleDragStart}
							onDragMove={handleDragMove}
							onDragEnd={handleDragEnd}
						/>
					);
				})}
			</div>
		</div>
	);
});
