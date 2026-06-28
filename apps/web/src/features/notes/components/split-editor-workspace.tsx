"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { EditorContainer } from "@/features/editor/components/editor-container";
import { EditorToolbar } from "@/features/editor/components/editor-toolbar";
import type { WorkspaceNavItem } from "@/features/editor/components/editor-toolbar";
import { stripMarkdownExtension } from "@/domain/notes/note-links";
import { useNotesStore, type EditorPane, type SplitOrientation } from "@/features/notes/store";
import { cn } from "@/shared/lib/utils";
import type { NoteFile, NoteEditorMode, RichTextDocument } from "@/types/notes";

type SplitEditorWorkspaceProps = {
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
	onToggleSidebar: () => void;
	onToggleMetadata: () => void;
	workspaceItems?: WorkspaceNavItem[];
	onOpenSettings?: () => void;
	onNavigatePrev: () => void;
	onNavigateNext: () => void;
	onToggleSplit: () => void;
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
		},
	) => void;
	onRenameFile?: (id: string, name: string) => void;
	onEditorBlur?: (fileId: string) => void;
};

const SNAP_RATIO = 0.32;

type PaneConfig = {
	pane: EditorPane;
	file: NoteFile | null;
	editorMode: "raw" | "block";
	showClose: boolean;
};

export function SplitEditorWorkspace({
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
	onToggleSidebar,
	onToggleMetadata,
	workspaceItems,
	onOpenSettings,
	onNavigatePrev,
	onNavigateNext,
	onToggleSplit,
	onToggleSplitOrientation,
	onSwapPaneOrder,
	onCloseSplit,
	onFocusPane,
	onScrollPositionChange,
	onContentChange,
	onRenameFile,
	onEditorBlur,
}: SplitEditorWorkspaceProps) {
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

	const panes: PaneConfig[] = secondaryFirst
		? [
				{
					pane: "secondary",
					file: secondaryFile,
					editorMode: secondaryEditorMode,
					showClose: true,
				},
				{ pane: "primary", file: primaryFile, editorMode, showClose: false },
			]
		: [
				{ pane: "primary", file: primaryFile, editorMode, showClose: false },
				{
					pane: "secondary",
					file: secondaryFile,
					editorMode: secondaryEditorMode,
					showClose: true,
				},
			];

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

			if (releaseTarget && pointerId !== undefined && releaseTarget.hasPointerCapture(pointerId)) {
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
			<EditorToolbar
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
			<div
				ref={containerRef}
				className={cn(
					"relative flex min-h-0 flex-1",
					isVertical ? "flex-row divide-x divide-border" : "flex-col divide-y divide-border",
				)}
			>
				{panes.map(({ pane, file, editorMode: paneEditorMode, showClose }) => {
					const isDragging = draggingPane === pane;
					const translate = isDragging ? dragOffset : 0;

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
								transition: isDragging ? undefined : "transform 180ms cubic-bezier(0.23, 1, 0.32, 1)",
							}}
						>
							<EditorContainer
								variant="pane"
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
								fileName={file?.name || ""}
								onRenameFile={onRenameFile}
								onEditorBlur={file ? () => onEditorBlur?.(file.id) : undefined}
								isPaneFocused={focusedPane === pane}
								onPaneActivate={() => onFocusPane(pane)}
								paneLabel={paneLabel(file)}
								onClosePane={showClose ? onCloseSplit : undefined}
								onPaneDragHandlePointerDown={handleDragStart(pane)}
								onPaneDragHandlePointerMove={isDragging ? handleDragMove : undefined}
								onPaneDragHandlePointerUp={isDragging ? handleDragEnd : undefined}
								isPaneDragging={isDragging}
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
