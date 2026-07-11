"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, m } from "framer-motion";
import { WorkspaceLoadingShell } from "@/features/layout/components/app-loading-shell";
import { resolveEditorMode } from "@/features/editor/lib/editor-mode";
import type {
	WorkspaceNavItem,
	EditorSaveState,
} from "@/features/editor/components/editor-toolbar";
import { useNotesStore, type EditorPane, type SplitOrientation } from "@/features/notes/store";
import { useNote } from "@/features/notes/hooks/use-note";
import { TOGGLE_EDITOR_MODE_EVENT } from "@/features/notes/lib/editor-mode-toggle-bus";
import type { NoteFile, NoteVersion, NoteEditorMode, RichTextDocument } from "@/types/notes";
import type { NoteProperty } from "@/domain/notes/properties";
import type { WorkspaceTabBarApi } from "./editor-tabs/tab-bar";
import { EditorWorkspace } from "./editor-workspace";

const VersionPreviewContainer = dynamic(
	() =>
		import("@/features/editor/components/version-preview-container").then((mod) => ({
			default: mod.VersionPreviewContainer,
		})),
	{ ssr: false, loading: () => <WorkspaceLoadingShell variant="notes" /> },
);

const ShareScreen = dynamic(
	() =>
		import("@/features/sharing/components/share-screen").then((mod) => ({
			default: mod.ShareScreen,
		})),
	{ ssr: false, loading: () => <WorkspaceLoadingShell variant="notes" /> },
);

type Props = {
	activeFileId: string;
	splitSecondaryFileId: string | null;
	focusedEditorPane: EditorPane;
	splitOrientation: SplitOrientation;
	splitSecondaryFirst: boolean;
	isMobile: boolean;
	metadataFiles: NoteFile[];
	defaultModeRaw: boolean;
	isEditorReady: boolean;
	prefersReducedMotion: boolean;
	sharingNoteId: string | null;
	viewingVersion: NoteVersion | null;
	isRestoringVersion: boolean;
	canNavigatePrev: boolean;
	canNavigateNext: boolean;
	canToggleSplit: boolean;
	primarySaveState?: EditorSaveState;
	workspaceItems?: WorkspaceNavItem[];
	tabBar?: WorkspaceTabBarApi;
	toggleEditorModeFor: (file: NoteFile | null, mode: "raw" | "block" | null) => void;
	onToggleSidebar: () => void;
	onToggleMetadata: () => void;
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
			properties?: NoteProperty[];
		},
	) => void;
	onCreateFile: () => void;
	onRenameFile?: (id: string, name: string) => void;
	onEditorBlur?: (fileId: string) => void;
	onExitVersionPreview: () => void;
	onRestoreViewedVersion: () => void;
	onCloseShare: () => void;
};

function mergeNote(files: NoteFile[], note: NoteFile | null): NoteFile[] {
	if (!note) return files;
	let found = false;
	const next = files.map((file) => {
		if (file.id !== note.id) return file;
		found = true;
		return note;
	});
	return found ? next : [...next, note];
}

export function EditorPaneHost({
	activeFileId,
	splitSecondaryFileId,
	focusedEditorPane,
	splitOrientation,
	splitSecondaryFirst,
	isMobile,
	metadataFiles,
	defaultModeRaw,
	isEditorReady,
	prefersReducedMotion,
	sharingNoteId,
	viewingVersion,
	isRestoringVersion,
	canNavigatePrev,
	canNavigateNext,
	canToggleSplit,
	primarySaveState,
	workspaceItems,
	tabBar,
	toggleEditorModeFor,
	onToggleSidebar,
	onToggleMetadata,
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
	onCreateFile,
	onRenameFile,
	onEditorBlur,
	onExitVersionPreview,
	onRestoreViewedVersion,
	onCloseShare,
}: Props) {
	const closeSplit = useNotesStore((state) => state.closeSplit);
	const activeNoteQuery = useNote(activeFileId);
	const secondaryNoteQuery = useNote(splitSecondaryFileId ?? "");

	const activeNote = activeNoteQuery.isPlaceholderData ? null : (activeNoteQuery.data ?? null);
	const secondaryNote = secondaryNoteQuery.isPlaceholderData
		? null
		: (secondaryNoteQuery.data ?? null);

	const files = useMemo(
		() => mergeNote(mergeNote(metadataFiles, activeNote), secondaryNote),
		[metadataFiles, activeNote, secondaryNote],
	);

	const activeFile = activeNote;
	const secondaryFile = useMemo(() => {
		if (!splitSecondaryFileId) return null;
		return files.find((file) => file.id === splitSecondaryFileId) ?? secondaryNote;
	}, [files, secondaryNote, splitSecondaryFileId]);

	const splitEnabled = Boolean(
		splitSecondaryFileId && secondaryFile && !isMobile && !sharingNoteId && !viewingVersion,
	);

	const focusedFile =
		splitEnabled && focusedEditorPane === "secondary" && secondaryFile
			? secondaryFile
			: activeFile;

	// Resolve the editor surface synchronously from the active note. Deriving
	// (instead of holding state synced by an effect) means the mode is correct
	// on the same commit the note becomes available — no one-frame flash where
	// the gate clears but the mode is still null and the raw <textarea> shows.
	const editorMode = useMemo<"raw" | "block" | null>(() => {
		if (!activeFile) return null;
		return resolveEditorMode(activeFile, defaultModeRaw ? "raw" : "block");
	}, [activeFile, defaultModeRaw]);

	const secondaryEditorMode = useMemo<"raw" | "block">(() => {
		if (!secondaryFile) return "block";
		return resolveEditorMode(secondaryFile, defaultModeRaw ? "raw" : "block");
	}, [secondaryFile, defaultModeRaw]);

	const focusedEditorMode = useMemo<"raw" | "block" | null>(() => {
		if (!focusedFile) return null;
		return resolveEditorMode(focusedFile, defaultModeRaw ? "raw" : "block");
	}, [focusedFile, defaultModeRaw]);

	useEffect(() => {
		if (!splitSecondaryFileId || secondaryFile) return;
		closeSplit();
	}, [closeSplit, secondaryFile, splitSecondaryFileId]);

	const focusedFileRef = useRef(focusedFile);
	focusedFileRef.current = focusedFile;
	const focusedEditorModeRef = useRef(focusedEditorMode);
	focusedEditorModeRef.current = focusedEditorMode;
	useEffect(() => {
		function onToggle() {
			toggleEditorModeFor(focusedFileRef.current, focusedEditorModeRef.current);
		}
		window.addEventListener(TOGGLE_EDITOR_MODE_EVENT, onToggle);
		return () => window.removeEventListener(TOGGLE_EDITOR_MODE_EVENT, onToggle);
	}, [toggleEditorModeFor]);

	const isActiveNoteLoading =
		Boolean(activeFileId) &&
		metadataFiles.some((file) => file.id === activeFileId) &&
		!activeNote;

	const lastLoadedFileRef = useRef(activeFile);
	if (activeFile) {
		lastLoadedFileRef.current = activeFile;
	}
	const isSwappingNote =
		isActiveNoteLoading && isEditorReady && lastLoadedFileRef.current !== null;
	const displayFile = activeFile ?? (isSwappingNote ? lastLoadedFileRef.current : null);
	const showContentSkeleton = (isActiveNoteLoading || !isEditorReady) && !displayFile;

	const primaryFileName =
		metadataFiles.find((file) => file.id === activeFileId)?.name ??
		displayFile?.name ??
		"No file selected";

	const handleToggleEditorMode = () => {
		toggleEditorModeFor(focusedFile, focusedEditorMode);
	};

	return (
		<AnimatePresence mode="wait" initial={false}>
			<m.div
				key={sharingNoteId ? "share" : viewingVersion ? "version" : "editor"}
				initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 18 }}
				animate={{
					opacity: 1,
					x: 0,
					transition: { duration: 0.24, ease: [0.23, 1, 0.32, 1] },
				}}
				exit={
					prefersReducedMotion
						? { opacity: 0, transition: { duration: 0.12 } }
						: {
								opacity: 0,
								x: -12,
								transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] },
							}
				}
				className="flex min-h-0 min-w-0 flex-1 flex-col"
			>
				{sharingNoteId ? (
					<ShareScreen
						noteId={sharingNoteId}
						noteName={activeFile?.name ?? "this note"}
						onBack={onCloseShare}
					/>
				) : viewingVersion ? (
					<VersionPreviewContainer
						version={viewingVersion}
						file={activeFile}
						files={files}
						isMobile={isMobile}
						isRestoring={isRestoringVersion}
						onBack={onExitVersionPreview}
						onRestore={onRestoreViewedVersion}
					/>
				) : (
					<EditorWorkspace
						splitActive={Boolean(splitEnabled && secondaryFile)}
						primaryFile={displayFile}
						secondaryFile={secondaryFile}
						files={files}
						focusedPane={focusedEditorPane}
						editorMode={editorMode ?? "block"}
						secondaryEditorMode={secondaryEditorMode}
						orientation={splitOrientation}
						secondaryFirst={splitSecondaryFirst}
						isMobile={isMobile}
						canNavigatePrev={canNavigatePrev}
						canNavigateNext={canNavigateNext}
						canToggleSplit={canToggleSplit}
						primarySaveState={primarySaveState}
						primaryContentLoading={showContentSkeleton}
						primaryFileName={primaryFileName}
						onToggleSidebar={onToggleSidebar}
						onToggleMetadata={onToggleMetadata}
						workspaceItems={workspaceItems}
						onOpenSettings={onOpenSettings}
						onNavigatePrev={onNavigatePrev}
						onNavigateNext={onNavigateNext}
						onToggleSplit={onToggleSplit}
						onToggleEditorMode={handleToggleEditorMode}
						onToggleSplitOrientation={onToggleSplitOrientation}
						onSwapPaneOrder={onSwapPaneOrder}
						onCloseSplit={onCloseSplit}
						onFocusPane={onFocusPane}
						onScrollPositionChange={onScrollPositionChange}
						onContentChange={onContentChange}
						onCreateFile={onCreateFile}
						onRenameFile={onRenameFile}
						onEditorBlur={onEditorBlur}
						tabBar={tabBar}
					/>
				)}
			</m.div>
		</AnimatePresence>
	);
}
