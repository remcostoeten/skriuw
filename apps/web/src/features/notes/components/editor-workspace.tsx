"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { EditorContainer } from "@/features/editor/components/editor-container";
import { EditorToolbar } from "@/features/editor/components/editor-toolbar";
import type { EditorSaveState, WorkspaceNavItem } from "@/features/editor/components/editor-toolbar";
import { stripMarkdownExtension } from "@/domain/notes/note-links";
import { useNotesStore, type EditorPane, type SplitOrientation } from "@/features/notes/store";
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
	scrollPositions: Record<string, number>;
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

export function EditorWorkspace({
	splitActive,
	primaryFile,
	secondaryFile,
	files,
	focusedPane,
	editorMode,
	secondaryEditorMode,
	scrollPositions,
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
	const dragStartRef = useRef(0);
	const [draggingPane, setDraggingPane] = useState<EditorPane | null>(null);
	const [dragOffset, setDragOffset] = useState(0);

	const isVertical = orientation === "vertical";
	const focusedFile = focusedPane === "secondary" ? secondaryFile : primaryFile;
	const focusedFileName = focusedFile?.name || "No file selected";
	const focusedSaveState = useNotesStore(
		(state) => state.saveStates[focusedFile?.id ?? ""] ?? "idle",
	);

	const paneLabel = (file: NoteFile | null) =>
		file ? stripMarkdownExtension(file.name).replace(/-/g, " ") : "Empty pane";

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
					const paneTabItems =
						pane === "primary" ? tabBar?.primaryTabItems : tabBar?.secondaryTabItems;

					return (
						<div
							key={pane}
							data-editor-pane={pane}
							className={cn(
								"flex min-h-0 min-w-0 flex-1 flex-col",
								isDragging && "z-10",
							)}
							style={{
								transform: isVertical
									? `translateX(${translate}px)`
									: `translateY(${translate}px)`,
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
									onSelect={(id) => tabBar.onSelectTab(pane, id)}
									onClose={(id) => tabBar.onCloseTab(pane, id)}
									onReorder={(ids) => tabBar.onReorderTabs(pane, ids)}
									onTogglePin={(id) => tabBar.onTogglePinTab(pane, id)}
									onCloseOthers={(id) => tabBar.onCloseOtherTabs(pane, id)}
									onCloseToSide={(id, side) =>
										tabBar.onCloseTabsToSide(pane, id, side)
									}
									onDropNote={(targetId, droppedId) =>
										tabBar.onDropNoteOnTab(pane, targetId, droppedId)
									}
									onActivatePane={
										splitActive ? () => onFocusPane(pane) : undefined
									}
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
								onEditorBlur={file ? () => onEditorBlur?.(file.id) : undefined}
								isPaneFocused={splitActive ? focusedPane === pane : undefined}
								onPaneActivate={splitActive ? () => onFocusPane(pane) : undefined}
								paneLabel={splitActive ? paneLabel(file) : undefined}
								onToggleEditorMode={onToggleEditorMode}
								onClosePane={splitActive && showClose ? onCloseSplit : undefined}
								onPaneDragHandlePointerDown={
									splitActive ? handleDragStart(pane) : undefined
								}
								onPaneDragHandlePointerMove={
									splitActive && isDragging ? handleDragMove : undefined
								}
								onPaneDragHandlePointerUp={
									splitActive && isDragging ? handleDragEnd : undefined
								}
								isPaneDragging={splitActive && isDragging}
								initialScrollTop={file ? (scrollPositions[file.id] ?? 0) : 0}
								onScrollPositionChange={(scrollTop) => {
									if (file) onScrollPositionChange(file.id, scrollTop);
								}}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
