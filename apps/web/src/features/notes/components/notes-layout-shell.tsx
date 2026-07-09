"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { ChevronRight, Contact, FileText, Hash, Info, Link2, ListTree } from "lucide-react";
import type { ComponentType } from "react";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { AuthDrawerHost } from "@/features/layout/components/auth-drawer-host";
import { useFocusTrap } from "@/shared/hooks/use-focus-trap";
import { WorkspaceLoadingShell } from "@/features/layout/components/app-loading-shell";
import { isDevEnv, useDevToolsStore } from "@/features/dev-tools/store";
import { useOnboardingStore } from "@/features/onboarding/store";
import type { WorkspaceNavItem } from "@/features/editor/components/editor-toolbar";
import type { NoteVersion } from "@/types/notes";
import { cn } from "@/shared/lib/utils";
import { EditorWorkspace } from "./editor-workspace";
import { SplitDropZone } from "./split-drop-zone";
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
	() =>
		import("@/features/sharing/components/share-screen").then((mod) => ({
			default: mod.ShareScreen,
		})),
	{ ssr: false, loading: () => <WorkspaceLoadingShell variant="notes" /> },
);

const MetadataPanel = dynamic(
	() => import("./metadata-panel").then((mod) => ({ default: mod.MetadataPanel })),
	{ ssr: false, loading: () => <NotesMetadataPlaceholder /> },
);

const ShortcutHelpDialog = dynamic(
	() =>
		import("@/shared/ui/shortcut-help-dialog").then((mod) => ({
			default: mod.ShortcutHelpDialog,
		})),
	{ ssr: false, loading: () => null },
);

const WelcomeWalkthrough = dynamic(
	() =>
		import("@/features/onboarding/components/welcome-walkthrough").then((mod) => ({
			default: mod.WelcomeWalkthrough,
		})),
	{ ssr: false, loading: () => null },
);

const SHIMMER_STEP_MS = 70;

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

function MetadataPlaceholderBar({
	className,
	style,
	delay = 0,
}: {
	className?: string;
	style?: React.CSSProperties;
	delay?: number;
}) {
	return (
		<div
			className={cn("animate-skeleton-shimmer bg-foreground/[0.06]", className)}
			style={{ animationDelay: `${delay}ms`, ...style }}
		/>
	);
}

function MetadataPlaceholderSection({
	icon: Icon,
	label,
	children,
}: {
	icon: ComponentType<{ className?: string; strokeWidth?: number }>;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<section className="border-b border-border">
			<div className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2">
				<div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/45">
					<Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
					<span className="truncate">{label}</span>
				</div>
				<ChevronRight
					className="h-3.5 w-3.5 shrink-0 rotate-90 text-muted-foreground/30"
					strokeWidth={1.5}
				/>
			</div>
			<div className="px-4 pb-4">{children}</div>
		</section>
	);
}

function MetadataPlaceholderRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
			<span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/40">
				{label}
			</span>
			{children}
		</div>
	);
}

function NotesMetadataPlaceholder({
	isMobile = false,
	className,
}: {
	isMobile?: boolean;
	className?: string;
}) {
	return (
		<aside
			aria-label="Loading note inspector"
			aria-busy="true"
			className={cn(
				isMobile
					? "h-full w-full rounded-[inherit] border-0 bg-transparent"
					: "w-72 shrink-0 border-l border-border bg-background xl:w-80",
				className,
			)}
		>
			<div aria-hidden="true">
				<MetadataPlaceholderSection icon={ListTree} label="Outline">
					<div className="space-y-2.5">
						{[
							{ width: "72%", indent: 0 },
							{ width: "54%", indent: 12 },
							{ width: "64%", indent: 12 },
							{ width: "46%", indent: 24 },
						].map((row, index) => (
							<div
								key={`${row.width}-${row.indent}`}
								className="flex items-center gap-2"
							>
								<span
									className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/[0.08]"
									style={{ marginLeft: row.indent }}
								/>
								<MetadataPlaceholderBar
									className="h-2.5"
									style={{ width: row.width }}
									delay={index * SHIMMER_STEP_MS}
								/>
							</div>
						))}
					</div>
				</MetadataPlaceholderSection>

				<MetadataPlaceholderRow label="Page Icon">
					<MetadataPlaceholderBar className="h-6 w-6 rounded-md bg-foreground/[0.055]" />
				</MetadataPlaceholderRow>

				<MetadataPlaceholderRow label="Page Cover">
					<MetadataPlaceholderBar
						className="h-6 w-6 rounded-md bg-foreground/[0.055]"
						delay={SHIMMER_STEP_MS}
					/>
				</MetadataPlaceholderRow>

				<MetadataPlaceholderSection icon={Hash} label="Tags">
					<div className="flex flex-wrap gap-2">
						{["32%", "24%", "38%"].map((width, index) => (
							<MetadataPlaceholderBar
								key={width}
								className="h-6 rounded-full bg-foreground/[0.055]"
								style={{ width }}
								delay={index * SHIMMER_STEP_MS}
							/>
						))}
					</div>
				</MetadataPlaceholderSection>

				<MetadataPlaceholderSection icon={Contact} label="People">
					<MetadataPlaceholderBar className="h-2.5 w-[64%] bg-foreground/[0.045]" />
				</MetadataPlaceholderSection>

				<MetadataPlaceholderSection icon={Link2} label="Links">
					<div className="space-y-2">
						{["86%", "68%", "74%"].map((width, index) => (
							<div key={width} className="flex h-7 items-center gap-2">
								<FileText
									className="h-3.5 w-3.5 shrink-0 text-muted-foreground/24"
									strokeWidth={1.5}
								/>
								<MetadataPlaceholderBar
									className="h-2.5"
									style={{ width }}
									delay={index * SHIMMER_STEP_MS}
								/>
							</div>
						))}
					</div>
				</MetadataPlaceholderSection>

				<MetadataPlaceholderSection icon={Info} label="Details">
					<div className="space-y-2.5">
						{[
							{ label: "28%", value: "18%" },
							{ label: "34%", value: "26%" },
							{ label: "22%", value: "38%" },
							{ label: "30%", value: "32%" },
						].map((row, index) => (
							<div
								key={`${row.label}-${row.value}`}
								className="flex items-center justify-between gap-4"
							>
								<MetadataPlaceholderBar
									className="h-2.5 bg-foreground/[0.045]"
									style={{ width: row.label }}
									delay={index * SHIMMER_STEP_MS}
								/>
								<MetadataPlaceholderBar
									className="h-2.5 bg-foreground/[0.07]"
									style={{ width: row.value }}
									delay={index * SHIMMER_STEP_MS}
								/>
							</div>
						))}
					</div>
				</MetadataPlaceholderSection>
			</div>
		</aside>
	);
}

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
	const showWelcome = useOnboardingStore((s) => s.hydrated && !s.hasSeenWelcome);
	const {
		activeFile,
		focusedFile,
		secondaryFile,
		splitEnabled,
		focusedEditorPane,
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
		editorMode,
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
		handleToggleEditorMode,
		handleToggleMetadata,
		handleToggleSidebar,
		handleOpenInSplit,
		handleToggleSplit,
		handleToggleSplitOrientation,
		handleSwapSplitPaneOrder,
		isActiveNoteLoading,
		isEditorReady,
		isMetadataResizing,
		isMobile,
		isSidebarResizing,
		metadataDragControls,
		metadataRef,
		metadataTransition,
		metadataWidth,
		overlayTransition,
		prefersReducedMotion,
		setShowShortcutHelp,
		sidebarPanelProps,
		sidebarRef,
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

	if (forceLoading) {
		return <WorkspaceLoadingShell variant="notes" />;
	}

	return (
		<LazyMotion features={domAnimation}>
			<LayoutContainer className="bg-background">
				{showWelcome && <WelcomeWalkthrough />}
				<div className="relative flex min-h-0 flex-1 overflow-hidden">
					{isMobile ? <AuthDrawerHost /> : <IconRail />}

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
						<div className="relative flex min-w-0 flex-1 overflow-hidden">
							<SplitDropZone
								disabled={
									isMobile || Boolean(sharingNoteId) || Boolean(viewingVersion)
								}
								activeFileId={layout.activeFileId}
								onOpenInSplit={handleOpenInSplit}
								onFileSelect={sidebarPanelProps.actions.onFileSelect}
							>
								<AnimatePresence mode="wait" initial={false}>
									<m.div
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
												primarySaveState={layout.activeFileSaveState}
												primaryContentLoading={showContentSkeleton}
												primaryFileName={
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
												onToggleSidebar={handleToggleSidebar}
												onToggleMetadata={handleToggleMetadata}
												workspaceItems={workspaceItems}
												onOpenSettings={handleOpenSettings}
												onNavigatePrev={handleNavigatePrev}
												onNavigateNext={handleNavigateNext}
												onToggleSplit={handleToggleSplit}
												onToggleEditorMode={handleToggleEditorMode}
												onToggleSplitOrientation={
													handleToggleSplitOrientation
												}
												onSwapPaneOrder={handleSwapSplitPaneOrder}
												onCloseSplit={handleCloseSplit}
												onFocusPane={handleFocusEditorPane}
												onScrollPositionChange={
													handleEditorScrollPositionChange
												}
												onContentChange={updateFileContent}
												onCreateFile={() => layout.createFile()}
												onRenameFile={layout.renameFile}
												onEditorBlur={flushFileEdits}
												tabBar={tabBar}
											/>
										)}
									</m.div>
								</AnimatePresence>
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
												{showContentSkeleton ? (
													<NotesMetadataPlaceholder className="w-full xl:w-full" />
												) : (
													<MetadataPanel
														file={focusedFile ?? displayFile}
														files={files}
														editorMode={
															focusedEditorMode ??
															editorMode ??
															"block"
														}
														onToggleEditorMode={handleToggleEditorMode}
														onFileSelect={
															sidebarPanelProps.actions.onFileSelect
														}
														onViewVersion={handleViewVersion}
														onShare={handleOpenShare}
														className="h-full w-full shrink-0 xl:w-full"
													/>
												)}
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
											onViewVersion={handleMobileViewVersion}
											onShare={handleMobileShareNote}
											onRequestClose={closeMetadata}
											className="h-full w-full border-l-0"
										/>
									)}
								</m.div>
							</div>
						</>
					)}
				</AnimatePresence>
			</LayoutContainer>
		</LazyMotion>
	);
}
