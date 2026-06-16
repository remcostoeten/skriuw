"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { useFocusTrap } from "@/shared/hooks/use-focus-trap";
import { perf } from "@/shared/perf/track";
import { WorkspaceLoadingShell } from "@/features/layout/components/app-loading-shell";
import { isDevEnv, useDevToolsStore } from "@/features/dev-tools/store";
import { EditorContainer } from "@/features/editor/components/editor-container";
import { SplitEditorWorkspace } from "./split-editor-workspace";
import { SidebarPanel } from "./sidebar-panel";
import { useNotesLayout } from "../hooks/use-notes-layout";

const VersionPreviewContainer = dynamic(
	() =>
		import("@/features/editor/components/version-preview-container").then((mod) => ({
			default: mod.VersionPreviewContainer,
		})),
	{ ssr: false, loading: () => <WorkspaceLoadingShell variant="notes" /> },
);

const ShareScreen = dynamic(
	() => import("@/features/sharing/components/share-screen").then((mod) => ({
		default: mod.ShareScreen,
	})),
	{ ssr: false, loading: () => <WorkspaceLoadingShell variant="notes" /> },
);

const MetadataPanel = dynamic(
	() => import("./metadata-panel").then((mod) => ({ default: mod.MetadataPanel })),
	{ ssr: false, loading: () => <NotesMetadataPlaceholder /> },
);

const CommandPalette = dynamic(
	() => import("@/shared/ui/command-palette").then((mod) => ({ default: mod.CommandPalette })),
	{ ssr: false, loading: () => null },
);

const ShortcutHelpDialog = dynamic(
	() =>
		import("@/shared/ui/shortcut-help-dialog").then((mod) => ({
			default: mod.ShortcutHelpDialog,
		})),
	{ ssr: false, loading: () => null },
);

function NotesMetadataPlaceholder({ isMobile = false }: { isMobile?: boolean }) {
	return (
		<aside
			aria-label="Loading note inspector"
			aria-busy="true"
			className={
				isMobile
					? "h-full w-full rounded-[inherit] border-0 bg-transparent"
					: "w-72 shrink-0 border-l border-border bg-background xl:w-80"
			}
		>
			<div className="space-y-5 px-4 py-4" aria-hidden="true">
				{Array.from({ length: 4 }).map((_, sectionIndex) => (
					<div key={sectionIndex} className="space-y-2.5">
						<div className="h-3 w-24 bg-muted" />
						<div className="space-y-1.5">
							<div className="h-2 w-full bg-muted/70" />
							<div className="h-2 w-10/12 bg-muted/55" />
							<div className="h-2 w-7/12 bg-muted/45" />
						</div>
					</div>
				))}
			</div>
		</aside>
	);
}

type NotesLayoutShellProps = {
	initialActiveFileId?: string | null;
	initialUserScopeId?: string | null;
};

export function NotesLayoutShell({
	initialActiveFileId = null,
	initialUserScopeId = null,
}: NotesLayoutShellProps = {}) {
	const layout = useNotesLayout({ initialActiveFileId, initialUserScopeId });
	const forceLoading = useDevToolsStore((s) => s.forceLoading) && isDevEnv();
	const {
		activeFile,
		focusedFile,
		secondaryFile,
		splitEnabled,
		focusedEditorPane,
		editorScrollPositions,
		splitOrientation,
		splitSecondaryFirst,
		secondaryEditorMode,
		focusedEditorMode,
		files,
		canNavigateNext,
		canNavigatePrev,
		canToggleSplit,
		closeMetadata,
		closeSidebar,
		commandItems,
		editorMode,
		handleCloseSplit,
		handleDesktopSidebarResizeStart,
		handleEditorScrollPositionChange,
		handleFocusEditorPane,
		handleMetadataDragEnd,
		handleMetadataDragStart,
		handleNavigateNext,
		handleNavigatePrev,
		handleOpenSettings,
		handleSidebarDragEnd,
		handleToggleEditorMode,
		handleToggleMetadata,
		handleToggleSidebar,
		handleToggleSplit,
		handleToggleSplitOrientation,
		handleSwapSplitPaneOrder,
		isActiveNoteLoading,
		isEditorReady,
		isMobile,
		metadataDragControls,
		metadataTransition,
		overlayTransition,
		prefersReducedMotion,
		setShowCommandPalette,
		setShowShortcutHelp,
		sidebarPanelProps,
		sidebarRef,
		sidebarTransition,
		sidebarWidth,
		showCommandPalette,
		showMetadata,
		showSidebar,
		showShortcutHelp,
		shortcutGroups,
		flushFileEdits,
		updateFileContent,
		viewingVersion,
		handleViewVersion,
		handleExitVersionPreview,
		handleRestoreViewedVersion,
		isRestoringVersion,
		sharingNoteId,
		handleOpenShare,
		handleCloseShare,
	} = layout;

	const mobileSidebarRef = useRef<HTMLDivElement>(null);
	const mobileMetadataRef = useRef<HTMLDivElement>(null);
	useFocusTrap(isMobile && showSidebar, mobileSidebarRef);
	useFocusTrap(isMobile && showMetadata, mobileMetadataRef);
	const mobileOverlayOpen = isMobile && (showSidebar || showMetadata);

	// Local-first note swap: when moving to a note whose body isn't cached yet,
	// keep the previously loaded note on screen instead of flashing the editor
	// skeleton. Selection in the sidebar responds instantly (it's keyed on the
	// target id); the document body just catches up a beat later. A genuinely
	// cold first load (no prior note) still shows the skeleton, and an empty
	// selection still shows the empty state.
	const lastLoadedFileRef = useRef(activeFile);
	if (activeFile) {
		lastLoadedFileRef.current = activeFile;
	}
	const isSwappingNote =
		isActiveNoteLoading && isEditorReady && lastLoadedFileRef.current !== null;
	const displayFile = activeFile ?? (isSwappingNote ? lastLoadedFileRef.current : null);
	const showContentSkeleton = (isActiveNoteLoading || !isEditorReady) && !displayFile;

	// Close the select→painted timer once the real body for the selected note is
	// on screen (resolved, not a placeholder, no skeleton). No-op unless perf
	// tracking is enabled, so it's free in production.
	const paintedFileId =
		!showContentSkeleton && activeFile?.id === layout.activeFileId ? activeFile?.id : null;
	useEffect(() => {
		if (paintedFileId) perf.openEnd(paintedFileId);
	}, [paintedFileId]);

	if (forceLoading) {
		return <WorkspaceLoadingShell variant="notes" />;
	}

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				{!isMobile && <IconRail onOpenSettings={handleOpenSettings} />}

				{/* The chrome below (sidebar frame, toolbar, status bar) is static —
				    it renders unconditionally on the first paint. Only the data
				    regions inside it (file tree, document body, metadata) swap to
				    skeletons while their queries resolve, so nothing blocks and
				    nothing shifts. */}
				{!isMobile && showSidebar && (
					<div
						ref={sidebarRef}
						className="relative shrink-0 bg-sidebar"
						style={{ width: sidebarWidth }}
					>
						<SidebarPanel
							{...sidebarPanelProps}
							isFilesLoading={sidebarPanelProps.isFilesLoading || !isEditorReady}
						/>
						<div
							role="separator"
							aria-orientation="vertical"
							aria-label="Resize sidebar"
							onPointerDown={handleDesktopSidebarResizeStart}
							className="absolute inset-y-0 -right-1 z-20 hidden w-3 cursor-col-resize items-center justify-center md:flex"
						>
							<div className="flex h-12 w-0.5 items-center justify-center rounded-full bg-foreground/8 transition-colors hover:bg-foreground/20" />
						</div>
					</div>
				)}

				<div
					className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
					inert={mobileOverlayOpen ? true : undefined}
				>
					<div className="relative flex min-w-0 flex-1 overflow-hidden">
						<div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
							<AnimatePresence mode="wait" initial={false}>
								<motion.div
									key={
										sharingNoteId
											? "share"
											: viewingVersion
												? "version"
												: "editor"
									}
									initial={
										prefersReducedMotion
											? { opacity: 0 }
											: { opacity: 0, x: 18 }
									}
									animate={{
										opacity: 1,
										x: 0,
										transition: {
											duration: 0.24,
											ease: [0.23, 1, 0.32, 1],
										},
									}}
									exit={
										prefersReducedMotion
											? { opacity: 0, transition: { duration: 0.12 } }
											: {
													opacity: 0,
													x: -12,
													transition: {
														duration: 0.16,
														ease: [0.23, 1, 0.32, 1],
													},
												}
									}
									style={{ willChange: "transform, opacity" }}
									className="flex min-h-0 flex-1 flex-col"
								>
									{sharingNoteId ? (
										<ShareScreen
											noteId={sharingNoteId}
											noteName={activeFile?.name ?? "this note"}
											onBack={handleCloseShare}
										/>
									) : viewingVersion ? (
										<VersionPreviewContainer
											version={viewingVersion}
											file={activeFile}
											files={files}
											isMobile={isMobile}
											isRestoring={isRestoringVersion}
											onBack={handleExitVersionPreview}
											onRestore={handleRestoreViewedVersion}
										/>
									) : splitEnabled && secondaryFile ? (
										<SplitEditorWorkspace
											primaryFile={activeFile}
											secondaryFile={secondaryFile}
											files={files}
											focusedPane={focusedEditorPane}
											editorMode={editorMode ?? "block"}
											secondaryEditorMode={secondaryEditorMode}
											scrollPositions={editorScrollPositions}
											orientation={splitOrientation}
											secondaryFirst={splitSecondaryFirst}
											isMobile={isMobile}
											canNavigatePrev={canNavigatePrev}
											canNavigateNext={canNavigateNext}
											onToggleSidebar={handleToggleSidebar}
											onToggleMetadata={handleToggleMetadata}
											onOpenSettings={handleOpenSettings}
											onNavigatePrev={handleNavigatePrev}
											onNavigateNext={handleNavigateNext}
											onToggleSplit={handleToggleSplit}
											onToggleSplitOrientation={handleToggleSplitOrientation}
											onSwapPaneOrder={handleSwapSplitPaneOrder}
											onCloseSplit={handleCloseSplit}
											onFocusPane={handleFocusEditorPane}
											onScrollPositionChange={handleEditorScrollPositionChange}
											onContentChange={updateFileContent}
											onRenameFile={layout.renameFile}
											onEditorBlur={flushFileEdits}
										/>
									) : (
										<EditorContainer
											file={displayFile}
											files={files}
											editorMode={editorMode ?? "block"}
											isMobile={isMobile}
											onContentChange={updateFileContent}
											onToggleSidebar={handleToggleSidebar}
											onToggleMetadata={handleToggleMetadata}
											onOpenSettings={handleOpenSettings}
											onNavigatePrev={handleNavigatePrev}
											onNavigateNext={handleNavigateNext}
											onEditorBlur={
												displayFile
													? () => flushFileEdits(displayFile.id)
													: undefined
											}
											canNavigatePrev={canNavigatePrev}
											canNavigateNext={canNavigateNext}
											canToggleSplit={canToggleSplit}
											onToggleSplit={handleToggleSplit}
											splitEnabled={false}
											initialScrollTop={
												displayFile
													? (editorScrollPositions[displayFile.id] ?? 0)
													: 0
											}
											onScrollPositionChange={(scrollTop) => {
												if (displayFile) {
													handleEditorScrollPositionChange(
														displayFile.id,
														scrollTop,
													);
												}
											}}
											isContentLoading={showContentSkeleton}
											fileName={
												// Prefer the selected note's name from metadata
												// (always available, updates the same commit
												// selection moves) so the toolbar tracks the
												// sidebar instantly during a cold swap — even
												// while the previous body is still on screen.
												files.find(
													(file) => file.id === layout.activeFileId,
												)?.name ??
												displayFile?.name ??
												"No file selected"
											}
											onRenameFile={layout.renameFile}
										/>
									)}
								</motion.div>
							</AnimatePresence>
						</div>

							{!isMobile &&
								showMetadata &&
								(showContentSkeleton ? (
									<NotesMetadataPlaceholder />
								) : (
									<MetadataPanel
										file={focusedFile ?? displayFile}
										files={files}
										editorMode={focusedEditorMode ?? editorMode ?? "block"}
										onToggleEditorMode={handleToggleEditorMode}
										onFileSelect={sidebarPanelProps.actions.onFileSelect}
										onViewVersion={handleViewVersion}
										onShare={handleOpenShare}
										className="h-full shrink-0"
									/>
								))}
					</div>
				</div>
			</div>

			<CommandPalette
				open={showCommandPalette}
				onOpenChange={setShowCommandPalette}
				items={commandItems}
				description="Notes actions and route navigation."
			/>
			<ShortcutHelpDialog
				open={showShortcutHelp}
				onOpenChange={setShowShortcutHelp}
				groups={shortcutGroups}
				description="Global shortcuts for notes."
			/>

			<AnimatePresence>
				{isEditorReady && isMobile && showSidebar && (
					<>
						<motion.button
							key="sidebar-backdrop"
							type="button"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={overlayTransition}
							className="absolute inset-0 z-40 bg-scrim/58"
							onClick={closeSidebar}
							aria-label="Close sidebar"
						/>
						<div className="pointer-events-none absolute inset-y-0 left-0 z-50 flex w-full max-w-full items-stretch pr-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
							<motion.div
								key="sidebar-panel"
								ref={mobileSidebarRef}
								initial={
									prefersReducedMotion
										? { x: -12, opacity: 0 }
										: { x: -24, opacity: 0.96 }
								}
								animate={{ x: 0, opacity: 1 }}
								exit={
									prefersReducedMotion
										? { x: -8, opacity: 0 }
										: { x: -32, opacity: 0.94 }
								}
								transition={sidebarTransition}
								drag="x"
								dragConstraints={{ left: 0, right: 0 }}
								dragDirectionLock
								dragElastic={{ left: 0.14, right: 0.05 }}
								onDragEnd={handleSidebarDragEnd}
								style={{ willChange: "transform, opacity" }}
								className="native-panel pointer-events-auto relative h-full w-[min(92vw,24rem)] max-w-full overflow-hidden border border-l-0 border-border touch-pan-y"
							>
								<div className="pointer-events-none absolute inset-y-0 right-1 z-10 flex items-center">
									<div className="flex h-16 w-1 flex-col items-center justify-center gap-2 rounded-sm bg-foreground/20">
										<div className="h-5 w-1 rounded-full bg-foreground/50" />
									</div>
								</div>
								<SidebarPanel
									{...sidebarPanelProps}
									className="w-full border-r-0 bg-transparent"
									onRequestClose={closeSidebar}
									showCloseButton
								/>
							</motion.div>
						</div>
					</>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{isEditorReady && isMobile && showMetadata && (
					<>
						<motion.button
							key="metadata-backdrop"
							type="button"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={overlayTransition}
							className="absolute inset-0 z-40 bg-scrim/52"
							onClick={closeMetadata}
							aria-label="Close metadata panel"
						/>
						<div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)]">
							<motion.div
								key="metadata-panel"
								ref={mobileMetadataRef}
								initial={
									prefersReducedMotion
										? { y: 16, opacity: 0 }
										: { y: 56, opacity: 0.98 }
								}
								animate={{ y: 0, opacity: 1 }}
								exit={
									prefersReducedMotion
										? { y: 12, opacity: 0 }
										: { y: 88, opacity: 0.94 }
								}
								transition={metadataTransition}
								drag="y"
								dragControls={metadataDragControls}
								dragListener={false}
								dragConstraints={{ top: 0, bottom: 0 }}
								dragDirectionLock
								dragElastic={{ top: 0.05, bottom: 0.16 }}
								onPointerDownCapture={handleMetadataDragStart}
								onDragEnd={handleMetadataDragEnd}
								style={{ willChange: "transform, opacity" }}
								className="native-panel pointer-events-auto mx-auto h-[min(74dvh,38rem)] w-full max-w-[36rem] overflow-hidden border border-border touch-pan-x"
							>
								{showContentSkeleton ? (
									<NotesMetadataPlaceholder isMobile />
								) : (
									<MetadataPanel
										file={focusedFile ?? displayFile}
										files={files}
										isMobile
										editorMode={focusedEditorMode ?? editorMode ?? "block"}
										onToggleEditorMode={handleToggleEditorMode}
										onFileSelect={sidebarPanelProps.actions.onFileSelect}
										onViewVersion={(version) => {
											handleViewVersion(version);
											closeMetadata();
										}}
										onShare={(noteId) => {
											handleOpenShare(noteId);
											closeMetadata();
										}}
										onRequestClose={closeMetadata}
										className="h-full w-full border-l-0"
									/>
								)}
							</motion.div>
						</div>
					</>
				)}
			</AnimatePresence>
		</LayoutContainer>
	);
}
