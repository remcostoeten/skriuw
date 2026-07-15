"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { useFocusTrap } from "@/shared/hooks/use-focus-trap";
import { WorkspaceLoadingShell } from "@/features/layout/components/app-loading-shell";
import { isDevEnv, useDevToolsStore } from "@/features/dev-tools/store";
import { useTourStore } from "@/features/onboarding/store";
import type { WorkspaceNavItem } from "@/features/editor/components/editor-toolbar";
import type { NoteVersion } from "@/types/notes";
import { EditorPaneHost } from "./editor-pane-host";
import { MetadataPanelHost } from "./metadata-panel-host";
import { NotesMetadataPlaceholder } from "./metadata-placeholder";
import { SplitDropZone } from "./split-drop-zone";
import { SidebarPanel } from "./sidebar-panel";
import { useNotesLayout } from "../hooks/use-notes-layout";

const ShortcutHelpDialog = dynamic(
	() =>
		import("@/shared/ui/shortcut-help-dialog").then((mod) => ({
			default: mod.ShortcutHelpDialog,
		})),
	{ ssr: false, loading: () => null },
);

const ProductTour = dynamic(
	() =>
		import("@/features/onboarding/components/product-tour").then((mod) => ({
			default: mod.ProductTour,
		})),
	{ ssr: false, loading: () => null },
);

const SWIPE_MAX_DURATION_MS = 700;
const SWIPE_MAX_PERPENDICULAR = 48;
const SWIPE_EDGE_ZONE = 28;
const SWIPE_EDGE_OPEN_DISTANCE = 48;
const SWIPE_NAV_DISTANCE = 80;

type WorkspaceSwipeStart = {
	pointerId: number;
	x: number;
	y: number;
	time: number;
};

type NotesLayoutShellProps = {
	initialActiveFileId?: string | null;
	initialUserScopeId?: string | null;
};

// react-doctor-disable-next-line react-doctor/no-giant-component -- shell intentionally coordinates the full notes workspace in one place.
export function NotesLayoutShell({
	initialActiveFileId = null,
	initialUserScopeId = null,
}: NotesLayoutShellProps = {}) {
	// react-doctor-disable-next-line react-doctor/no-event-handler -- initial note/scope seeding is owned by the layout controller hook.
	const layout = useNotesLayout({ initialActiveFileId, initialUserScopeId });
	const pathname = usePathname();
	const forceLoading = useDevToolsStore((s) => s.forceLoading) && isDevEnv();
	const showTour = useTourStore((s) => s.hydrated && (!s.hasSeenTour || s.activeStep !== null));
	const {
		metadataFiles,
		splitSecondaryFileId,
		focusedEditorPane,
		focusedFileIdForNav,
		splitOrientation,
		splitSecondaryFirst,
		defaultModeRaw,
		activeFileId,
		activeFileSaveState,
		canNavigateNext,
		canNavigatePrev,
		canToggleSplit,
		closeMetadata,
		closeSidebar,
		toggleEditorModeFor,
		handleCloseSplit,
		handleDesktopMetadataResizeStart,
		handleDesktopSidebarResizeStart,
		handleEditorScrollPositionChange,
		handleFocusEditorPane,
		handleMetadataDragEnd,
		handleMetadataDragStart,
		handleNavigateNext,
		handleNavigatePrev,
		handleOpenSettings,
		handleSidebarDragEnd,
		handleToggleMetadata,
		handleToggleSidebar,
		handleOpenInSplit,
		handleToggleSplit,
		handleToggleSplitOrientation,
		handleSwapSplitPaneOrder,
		isEditorReady,
		isMetadataResizing,
		isMobile,
		isSidebarResizing,
		metadataDragControls,
		metadataRef,
		metadataExitTransition,
		metadataTransition,
		metadataWidth,
		overlayTransition,
		prefersReducedMotion,
		setShowShortcutHelp,
		sidebarPanelProps,
		sidebarRef,
		sidebarExitTransition,
		sidebarTransition,
		sidebarWidth,
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
		tabBar,
	} = layout;

	const mobileSidebarRef = useRef<HTMLDivElement>(null);
	const mobileMetadataRef = useRef<HTMLDivElement>(null);
	useFocusTrap(isMobile && showSidebar, mobileSidebarRef);
	useFocusTrap(isMobile && showMetadata, mobileMetadataRef);
	const mobileOverlayOpen = isMobile && (showSidebar || showMetadata);

	const workspaceSwipeRef = useRef<WorkspaceSwipeStart | null>(null);

	const handleWorkspacePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (!isMobile || event.pointerType !== "touch") {
				workspaceSwipeRef.current = null;
				return;
			}
			// Strokes drawn in annotate mode must never read as nav swipes.
			if (
				event.target instanceof Element &&
				event.target.closest('[data-annotation-overlay="active"]')
			) {
				workspaceSwipeRef.current = null;
				return;
			}
			workspaceSwipeRef.current = {
				pointerId: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				time: event.timeStamp,
			};
		},
		[isMobile],
	);

	const handleWorkspacePointerUp = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			const start = workspaceSwipeRef.current;
			workspaceSwipeRef.current = null;
			if (!start || start.pointerId !== event.pointerId) return;
			if (event.timeStamp - start.time > SWIPE_MAX_DURATION_MS) return;

			const dx = event.clientX - start.x;
			const dy = event.clientY - start.y;
			if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dy) > SWIPE_MAX_PERPENDICULAR) return;

			if (!showSidebar && start.x <= SWIPE_EDGE_ZONE && dx > SWIPE_EDGE_OPEN_DISTANCE) {
				handleToggleSidebar();
				return;
			}

			if (Math.abs(dx) < SWIPE_NAV_DISTANCE) return;

			if (dx > 0) {
				if (!canNavigatePrev) return;
				triggerNativeFeedback("selection");
				handleNavigatePrev();
			} else {
				if (!canNavigateNext) return;
				triggerNativeFeedback("selection");
				handleNavigateNext();
			}
		},
		[
			canNavigateNext,
			canNavigatePrev,
			handleNavigateNext,
			handleNavigatePrev,
			handleToggleSidebar,
			showSidebar,
		],
	);

	const clearWorkspaceSwipe = useCallback(() => {
		workspaceSwipeRef.current = null;
	}, []);
	const workspaceItems = useMemo<WorkspaceNavItem[]>(
		() => [
			{ href: "/app", label: "Notes", isActive: pathname === "/app" },
			{ href: "/app/journal", label: "Journal", isActive: pathname === "/app/journal" },
			{ href: "/app/graph", label: "Graph", isActive: pathname === "/app/graph" },
			{ href: "/app/shared", label: "Shared", isActive: pathname === "/app/shared" },
		],
		[pathname],
	);

	const handleMobileViewVersion = useCallback(
		(version: NoteVersion) => {
			handleViewVersion(version);
			closeMetadata();
		},
		[handleViewVersion, closeMetadata],
	);

	const handleMobileShareNote = useCallback(
		(noteId: string) => {
			handleOpenShare(noteId);
			closeMetadata();
		},
		[handleOpenShare, closeMetadata],
	);

	if (forceLoading) {
		return <WorkspaceLoadingShell variant="notes" />;
	}

	return (
		<LazyMotion features={domAnimation}>
			<LayoutContainer className="bg-background">
				{showTour && !isMobile && (
					<ProductTour onToggleShortcutHelp={setShowShortcutHelp} />
				)}
				<div className="relative flex min-h-0 flex-1 overflow-hidden">
					{/* The chrome below (sidebar frame, toolbar, status bar) is static —
				    it renders unconditionally on the first paint. Only the data
				    regions inside it (file tree, document body, metadata) swap to
				    skeletons while their queries resolve, so nothing blocks and
				    nothing shifts. */}
					{!isMobile && (
						<AnimatePresence initial={false}>
							{showSidebar && (
								<m.div
									key="desktop-sidebar"
									initial={
										prefersReducedMotion
											? { opacity: 0 }
											: { width: 0, opacity: 0 }
									}
									animate={
										prefersReducedMotion
											? {
													opacity: 1,
													transition: { duration: 0.1, ease: "linear" },
												}
											: {
													width: sidebarWidth,
													opacity: 1,
													transition: isSidebarResizing
														? { duration: 0 }
														: {
																duration: 0.22,
																ease: [0.23, 1, 0.32, 1],
															},
												}
									}
									exit={
										prefersReducedMotion
											? {
													opacity: 0,
													transition: { duration: 0.1, ease: "linear" },
												}
											: {
													width: 0,
													opacity: 0,
													transition: {
														duration: 0.18,
														ease: [0.23, 1, 0.32, 1],
													},
												}
									}
									style={{ overflow: "hidden", flexShrink: 0 }}
								>
									<div
										ref={sidebarRef}
										data-tour="sidebar"
										className="relative h-full bg-sidebar"
										style={{ width: sidebarWidth }}
									>
										<SidebarPanel
											{...sidebarPanelProps}
											sidebarWidth={sidebarWidth}
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
								</m.div>
							)}
						</AnimatePresence>
					)}

					<div
						className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
						inert={mobileOverlayOpen ? true : undefined}
						onPointerDownCapture={isMobile ? handleWorkspacePointerDown : undefined}
						onPointerUpCapture={isMobile ? handleWorkspacePointerUp : undefined}
						onPointerCancelCapture={isMobile ? clearWorkspaceSwipe : undefined}
					>
						<div
							data-tour="editor"
							className="relative flex min-w-0 flex-1 overflow-hidden"
						>
							<SplitDropZone
								disabled={
									isMobile || Boolean(sharingNoteId) || Boolean(viewingVersion)
								}
								activeFileId={activeFileId}
								onOpenInSplit={handleOpenInSplit}
								onFileSelect={sidebarPanelProps.actions.onFileSelect}
							>
								<EditorPaneHost
									activeFileId={activeFileId}
									splitSecondaryFileId={splitSecondaryFileId}
									focusedEditorPane={focusedEditorPane}
									splitOrientation={splitOrientation}
									splitSecondaryFirst={splitSecondaryFirst}
									isMobile={isMobile}
									metadataFiles={metadataFiles}
									defaultModeRaw={defaultModeRaw}
									isEditorReady={isEditorReady}
									prefersReducedMotion={prefersReducedMotion}
									sharingNoteId={sharingNoteId}
									viewingVersion={viewingVersion}
									isRestoringVersion={isRestoringVersion}
									canNavigatePrev={canNavigatePrev}
									canNavigateNext={canNavigateNext}
									canToggleSplit={canToggleSplit}
									primarySaveState={activeFileSaveState}
									workspaceItems={workspaceItems}
									tabBar={tabBar}
									toggleEditorModeFor={toggleEditorModeFor}
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
									onCreateFile={() => layout.createFile()}
									onRenameFile={layout.renameFile}
									onEditorBlur={flushFileEdits}
									onExitVersionPreview={handleExitVersionPreview}
									onRestoreViewedVersion={handleRestoreViewedVersion}
									onCloseShare={handleCloseShare}
								/>
							</SplitDropZone>

							{!isMobile && (
								<AnimatePresence initial={false}>
									{showMetadata && (
										<m.div
											key="desktop-metadata"
											initial={
												prefersReducedMotion
													? { opacity: 0 }
													: { width: 0, opacity: 0 }
											}
											animate={
												prefersReducedMotion
													? {
															opacity: 1,
															transition: {
																duration: 0.1,
																ease: "linear",
															},
														}
													: {
															width: metadataWidth,
															opacity: 1,
															transition: isMetadataResizing
																? { duration: 0 }
																: {
																		duration: 0.22,
																		ease: [0.23, 1, 0.32, 1],
																	},
														}
											}
											exit={
												prefersReducedMotion
													? {
															opacity: 0,
															transition: {
																duration: 0.1,
																ease: "linear",
															},
														}
													: {
															width: 0,
															opacity: 0,
															transition: {
																duration: 0.18,
																ease: [0.23, 1, 0.32, 1],
															},
														}
											}
											style={{ overflow: "hidden", flexShrink: 0 }}
										>
											<div
												ref={metadataRef}
												className="relative h-full bg-background"
												style={{ width: metadataWidth }}
											>
												<div
													role="separator"
													aria-orientation="vertical"
													aria-label="Resize metadata panel"
													onPointerDown={handleDesktopMetadataResizeStart}
													className="absolute inset-y-0 -left-1 z-20 hidden w-3 cursor-col-resize items-center justify-center md:flex"
												>
													<div className="flex h-12 w-0.5 items-center justify-center rounded-full bg-foreground/8 transition-colors hover:bg-foreground/20" />
												</div>
												<MetadataPanelHost
													focusedFileId={focusedFileIdForNav}
													metadataFiles={metadataFiles}
													defaultModeRaw={defaultModeRaw}
													isEditorReady={isEditorReady}
													placeholder={
														<NotesMetadataPlaceholder className="w-full xl:w-full" />
													}
													toggleEditorModeFor={toggleEditorModeFor}
													onFileSelect={
														sidebarPanelProps.actions.onFileSelect
													}
													onViewVersion={handleViewVersion}
													onShare={handleOpenShare}
													className="h-full w-full shrink-0 xl:w-full"
												/>
											</div>
										</m.div>
									)}
								</AnimatePresence>
							)}
						</div>
					</div>
				</div>

				<ShortcutHelpDialog
					open={showShortcutHelp}
					onOpenChange={setShowShortcutHelp}
					groups={shortcutGroups}
					description="Global shortcuts for notes."
				/>

				<AnimatePresence>
					{isEditorReady && isMobile && showSidebar && (
						<>
							<m.button
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
								<m.div
									key="sidebar-panel"
									ref={mobileSidebarRef}
									initial={
										prefersReducedMotion
											? { x: -12, opacity: 0 }
											: { x: "-100%", opacity: 1 }
									}
									animate={{ x: 0, opacity: 1, transition: sidebarTransition }}
									exit={
										prefersReducedMotion
											? {
													x: -8,
													opacity: 0,
													transition: sidebarExitTransition,
												}
											: {
													x: "-100%",
													opacity: 1,
													transition: sidebarExitTransition,
												}
									}
									drag="x"
									dragConstraints={{ left: 0, right: 0 }}
									dragDirectionLock
									dragElastic={{ left: 0.14, right: 0.05 }}
									onDragEnd={handleSidebarDragEnd}
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
								</m.div>
							</div>
						</>
					)}
				</AnimatePresence>

				<AnimatePresence>
					{isEditorReady && isMobile && showMetadata && (
						<>
							<m.button
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
								<m.div
									key="metadata-panel"
									ref={mobileMetadataRef}
									initial={
										prefersReducedMotion
											? { y: 16, opacity: 0 }
											: { y: "100%", opacity: 1 }
									}
									animate={{ y: 0, opacity: 1, transition: metadataTransition }}
									exit={
										prefersReducedMotion
											? {
													y: 12,
													opacity: 0,
													transition: metadataExitTransition,
												}
											: {
													y: "100%",
													opacity: 1,
													transition: metadataExitTransition,
												}
									}
									drag="y"
									dragControls={metadataDragControls}
									dragListener={false}
									dragConstraints={{ top: 0, bottom: 0 }}
									dragDirectionLock
									dragElastic={{ top: 0.05, bottom: 0.16 }}
									onPointerDownCapture={handleMetadataDragStart}
									onDragEnd={handleMetadataDragEnd}
									className="native-panel pointer-events-auto mx-auto h-[min(74dvh,38rem)] w-full max-w-[36rem] overflow-hidden border border-border touch-pan-x"
								>
									<MetadataPanelHost
										focusedFileId={focusedFileIdForNav}
										metadataFiles={metadataFiles}
										defaultModeRaw={defaultModeRaw}
										isEditorReady={isEditorReady}
										isMobile
										placeholder={<NotesMetadataPlaceholder isMobile />}
										toggleEditorModeFor={toggleEditorModeFor}
										onFileSelect={sidebarPanelProps.actions.onFileSelect}
										onViewVersion={handleMobileViewVersion}
										onShare={handleMobileShareNote}
										onRequestClose={closeMetadata}
										className="h-full w-full border-l-0"
									/>
								</m.div>
							</div>
						</>
					)}
				</AnimatePresence>
			</LayoutContainer>
		</LazyMotion>
	);
}
