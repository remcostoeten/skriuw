/* eslint-disable */
import {
	ChevronLeft,
	ChevronRight,
	Columns2,
	Download,
	FileCode,
	FileText,
	ListChecks,
	Loader2,
	PenTool,
	Rows2,
	ScrollText,
	Settings2,
	Sidebar,
	SlidersHorizontal,
	SpellCheck,
	Tags,
	Wand2,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import type { AiAction } from "@/features/ai/service";
import Link from "next/link";
import type { Awareness } from "y-protocols/awareness";
import { cn } from "@/shared/lib/utils";
import { PanelLeftToggleIcon } from "@/shared/icons/panel-left-toggle";
import { PanelRightToggleIcon } from "@/shared/icons/panel-right-toggle";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";
import { GuestGate } from "@/shared/ui/guest-gate";
import { CollabPresence } from "@/features/collaboration/components/collab-presence";
import { useShortcutHint, type ShortcutId } from "@/core/shortcuts";
import { isTauriRuntime } from "@/core/workspace-backend/tauri-backend";
import { usePreferencesStore } from "@/features/settings/store";

export type WorkspaceNavItem = {
	href: string;
	label: string;
	isActive?: boolean;
};

export type EditorSaveState = "idle" | "saving" | "saved" | "error";

const EMPTY_WORKSPACE_ITEMS: WorkspaceNavItem[] = [];

function runAiAction(handler?: () => void) {
	return () => {
		handler?.();
	};
}

type Props = {
	fileName: string;
	/** Page emoji chosen via the icon picker; rendered before the title. */
	fileIcon?: string;
	breadcrumb?: string[];
	saveState?: EditorSaveState;
	isMobile?: boolean;
	workspaceItems?: WorkspaceNavItem[];
	onToggleSidebar: () => void;
	onToggleMetadata: () => void;
	onOpenSettings?: () => void;
	onNavigatePrev?: () => void;
	onNavigateNext?: () => void;
	canNavigatePrev?: boolean;
	canNavigateNext?: boolean;
	aiLoading?: Partial<Record<AiAction, boolean>>;
	onAiGenerateTitle?: () => void;
	onAiSpellCheck?: () => void;
	onAiContinueWriting?: () => void;
	onAiAction?: (action: AiAction) => void;
	onExportNote?: (format: "md" | "html") => void;
	splitEnabled?: boolean;
	onToggleSplit?: () => void;
	canToggleSplit?: boolean;
	splitOrientation?: "vertical" | "horizontal";
	onToggleSplitOrientation?: () => void;
	annotating?: boolean;
	onToggleAnnotate?: () => void;
	/** Yjs awareness for the active note's collab room; drives the presence avatars. */
	presenceAwareness?: Awareness | null;
};

function WorkspaceMenu({
	items,
	buttonClassName,
}: {
	items: WorkspaceNavItem[];
	buttonClassName: string;
}) {
	if (items.length === 0) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={buttonClassName}
					aria-label="Workspaces"
					title="Workspaces"
				>
					<Columns2 className="h-4 w-4" strokeWidth={1.5} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44 rounded-none shadow-none">
				{items.map((item) => (
					<DropdownMenuItem key={item.href} asChild className="gap-2 text-xs">
						<Link
							href={item.href}
							prefetch
							aria-current={item.isActive ? "page" : undefined}
							className={cn(item.isActive && "font-medium text-foreground")}
						>
							<span
								className={cn(
									"h-1.5 w-1.5 rounded-full",
									item.isActive ? "bg-foreground" : "bg-muted-foreground/30",
								)}
								aria-hidden="true"
							/>
							{item.label}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ToolbarTooltip({
	label,
	shortcutId,
	hideShortcut = false,
	children,
}: {
	label: string;
	shortcutId?: ShortcutId;
	hideShortcut?: boolean;
	children: React.ReactNode;
}) {
	const shortcut = useShortcutHint(shortcutId);

	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent
				side="bottom"
				className="px-2 py-1 text-xs"
				shortcut={hideShortcut ? undefined : shortcut}
			>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

export const EditorToolbar = memo(function EditorToolbar({
	fileName,
	fileIcon,
	breadcrumb,
	saveState: _saveState,
	isMobile = false,
	workspaceItems = EMPTY_WORKSPACE_ITEMS,
	onToggleSidebar,
	onToggleMetadata,
	onOpenSettings,
	onNavigatePrev,
	onNavigateNext,
	canNavigatePrev = false,
	canNavigateNext = false,
	aiLoading,
	onAiGenerateTitle,
	onAiSpellCheck,
	onAiContinueWriting,
	onAiAction,
	onExportNote,
	splitEnabled,
	onToggleSplit,
	canToggleSplit = true,
	splitOrientation = "vertical",
	onToggleSplitOrientation,
	annotating = false,
	onToggleAnnotate,
	presenceAwareness,
}: Props) {
	const [isTauri, setIsTauri] = useState(false);
	useEffect(() => {
		setIsTauri(isTauriRuntime());
	}, []);
	const showPageIcons = usePreferencesStore((s) => s.appearance.showPageIcons);
	const titleIcon = showPageIcons && fileIcon ? fileIcon : null;

	const anyAiLoading = aiLoading ? Object.values(aiLoading).some(Boolean) : false;
	const hasAiActions = Boolean(
		onAiGenerateTitle || onAiSpellCheck || onAiContinueWriting || onAiAction,
	);
	const sidebarIconButtonClass =
		"flex h-8 w-8 items-center justify-center border border-transparent text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted hover:text-foreground";

	if (isMobile) {
		const mobileIconButton =
			"flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]";

		return (
			<header className="border-b border-border bg-card px-2 pb-2.5 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-3">
				<div className="flex min-h-11 items-center gap-0.5">
					<button
						type="button"
						onClick={onToggleSidebar}
						className={mobileIconButton}
						aria-label="Open notes"
					>
						<Sidebar className="h-5 w-5" strokeWidth={1.7} />
					</button>
					<WorkspaceMenu items={workspaceItems} buttonClassName={mobileIconButton} />

					<div className="min-w-0 flex-1 px-1.5">
						{breadcrumb && breadcrumb.length > 0 && (
							<p className="truncate text-[11px] leading-tight text-muted-foreground/70">
								{breadcrumb.join(" / ")}
							</p>
						)}
						<h1 className="truncate text-[17px] font-semibold leading-snug tracking-[-0.02em] text-foreground">
							{titleIcon && (
								<span className="mr-1.5" aria-hidden>
									{titleIcon}
								</span>
							)}
							{fileName}
						</h1>
					</div>

					<CollabPresence awareness={presenceAwareness} />

					<button
						type="button"
						onClick={onToggleMetadata}
						className={mobileIconButton}
						aria-label="Open note details"
					>
						<PanelRightToggleIcon size={20} strokeWidth={1.7} />
					</button>
					{onOpenSettings ? (
						<button
							type="button"
							onClick={onOpenSettings}
							className={mobileIconButton}
							aria-label="Open settings"
						>
							<Settings2 className="h-5 w-5" strokeWidth={1.7} />
						</button>
					) : null}
				</div>
			</header>
		);
	}

	return (
		<TooltipProvider>
			<div
				className={cn(
					"border-b border-sidebar-border bg-sidebar text-sidebar-foreground",
					"flex h-11 items-center gap-1 px-3",
				)}
				// Reserves space for the fixed WindowControls cluster (~128px) so
				// this toolbar's rightmost icons never sit underneath it, even
				// when the page is zoomed in.
				style={isTauri ? { paddingRight: 128 } : undefined}
			>
				<ToolbarTooltip label="Toggle sidebar" shortcutId="notes.toggleSidebar">
					<button
						type="button"
						onClick={onToggleSidebar}
						className={sidebarIconButtonClass}
						aria-label="Toggle sidebar"
					>
						<PanelLeftToggleIcon size={16} strokeWidth={1.5} />
					</button>
				</ToolbarTooltip>
				<WorkspaceMenu items={workspaceItems} buttonClassName={sidebarIconButtonClass} />
				<button
					type="button"
					onClick={onNavigatePrev}
					disabled={!canNavigatePrev}
					className={cn(
						sidebarIconButtonClass,
						!canNavigatePrev && "cursor-not-allowed text-muted-foreground/30",
					)}
					aria-label="Previous file"
				>
					<ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
				</button>
				<button
					type="button"
					onClick={onNavigateNext}
					disabled={!canNavigateNext}
					className={cn(
						sidebarIconButtonClass,
						!canNavigateNext && "cursor-not-allowed text-muted-foreground/30",
					)}
					aria-label="Next file"
				>
					<ChevronRight className="h-4 w-4" strokeWidth={1.5} />
				</button>

				<div
					data-tauri-drag-region
					className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 text-sm"
				>
					{breadcrumb && breadcrumb.length > 0 && (
						<>
							{breadcrumb.map((part, i) => (
								<span
									key={`${part}-${i}`}
									className="flex shrink-0 items-center gap-1.5"
								>
									<span className="text-muted-foreground/50 truncate">
										{part}
									</span>
									<span className="text-muted-foreground/50">/</span>
								</span>
							))}
						</>
					)}
					{titleIcon && (
						<span className="shrink-0 text-[13px] leading-none" aria-hidden>
							{titleIcon}
						</span>
					)}
					<span className="text-muted-foreground/50 truncate font-medium ">
						{fileName}
					</span>
				</div>

				<div className="flex shrink-0 items-center gap-1">
					<CollabPresence awareness={presenceAwareness} />
					{onToggleAnnotate && (
						<ToolbarTooltip label={annotating ? "Stop annotating" : "Annotate note"}>
							<button
								type="button"
								onClick={onToggleAnnotate}
								className={cn(
									sidebarIconButtonClass,
									annotating &&
										"border-border bg-muted text-foreground hover:bg-muted",
								)}
								aria-label={annotating ? "Stop annotating" : "Annotate note"}
								aria-pressed={annotating}
							>
								<PenTool className="h-4 w-4" strokeWidth={1.5} />
							</button>
						</ToolbarTooltip>
					)}
					{onToggleSplit && (
						<ToolbarTooltip
							label={splitEnabled ? "Close split editor" : "Split editor"}
							shortcutId="notes.toggleSplit"
						>
							<button
								type="button"
								onClick={onToggleSplit}
								disabled={!canToggleSplit}
								className={cn(
									sidebarIconButtonClass,
									splitEnabled &&
										"border-border bg-muted text-foreground hover:bg-muted",
									!canToggleSplit &&
										"cursor-not-allowed text-muted-foreground/30",
								)}
								aria-label={splitEnabled ? "Close split editor" : "Split editor"}
								aria-pressed={splitEnabled}
							>
								<Columns2 className="h-4 w-4" strokeWidth={1.5} />
							</button>
						</ToolbarTooltip>
					)}
					{splitEnabled && onToggleSplitOrientation ? (
						<button
							type="button"
							onClick={onToggleSplitOrientation}
							className={sidebarIconButtonClass}
							aria-label={
								splitOrientation === "vertical"
									? "Switch to horizontal split"
									: "Switch to vertical split"
							}
						>
							{splitOrientation === "vertical" ? (
								<Rows2 className="h-4 w-4" strokeWidth={1.5} />
							) : (
								<Columns2 className="h-4 w-4" strokeWidth={1.5} />
							)}
						</button>
					) : null}
					{hasAiActions && (
						<GuestGate feature="ai">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										data-tour="ai"
										disabled={anyAiLoading}
										className={cn(
											sidebarIconButtonClass,
											"text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
											anyAiLoading && "cursor-not-allowed opacity-50",
										)}
										aria-label="AI actions"
									>
										{anyAiLoading ? (
											<Loader2
												className="h-3.5 w-3.5 animate-spin"
												strokeWidth={1.6}
											/>
										) : (
											<SparkleIcon className="h-3.5 w-3.5" />
										)}
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="end"
									className="w-52 rounded-none shadow-none"
								>
									{onAiGenerateTitle && (
										<DropdownMenuItem
											onSelect={runAiAction(onAiGenerateTitle)}
											disabled={anyAiLoading}
											className="gap-2 text-xs"
										>
											<Wand2 className="h-3.5 w-3.5" strokeWidth={1.6} />
											Generate title
											{aiLoading?.generateTitle && (
												<Loader2
													className="ml-auto h-3 w-3 animate-spin"
													strokeWidth={1.6}
												/>
											)}
										</DropdownMenuItem>
									)}
									{onAiSpellCheck && (
										<DropdownMenuItem
											onSelect={runAiAction(onAiSpellCheck)}
											disabled={anyAiLoading}
											className="gap-2 text-xs"
										>
											<SpellCheck className="h-3.5 w-3.5" strokeWidth={1.6} />
											Spell check
											{aiLoading?.spellCheck && (
												<Loader2
													className="ml-auto h-3 w-3 animate-spin"
													strokeWidth={1.6}
												/>
											)}
										</DropdownMenuItem>
									)}
									{onAiContinueWriting && (
										<DropdownMenuItem
											onSelect={runAiAction(onAiContinueWriting)}
											disabled={anyAiLoading}
											className="gap-2 text-xs"
										>
											<PenTool className="h-3.5 w-3.5" strokeWidth={1.6} />
											Continue writing
											{aiLoading?.continueWriting && (
												<Loader2
													className="ml-auto h-3 w-3 animate-spin"
													strokeWidth={1.6}
												/>
											)}
										</DropdownMenuItem>
									)}
									{onAiAction && (
										<DropdownMenuItem
											onSelect={() => onAiAction("summarize")}
											disabled={anyAiLoading}
											className="gap-2 text-xs"
										>
											<ScrollText className="h-3.5 w-3.5" strokeWidth={1.6} />
											Summarize
											{aiLoading?.summarize && (
												<Loader2
													className="ml-auto h-3 w-3 animate-spin"
													strokeWidth={1.6}
												/>
											)}
										</DropdownMenuItem>
									)}
									{onAiAction && (
										<DropdownMenuItem
											onSelect={() => onAiAction("extractTasks")}
											disabled={anyAiLoading}
											className="gap-2 text-xs"
										>
											<ListChecks className="h-3.5 w-3.5" strokeWidth={1.6} />
											Extract tasks
											{aiLoading?.extractTasks && (
												<Loader2
													className="ml-auto h-3 w-3 animate-spin"
													strokeWidth={1.6}
												/>
											)}
										</DropdownMenuItem>
									)}
									{onAiAction && (
										<DropdownMenuItem
											onSelect={() => onAiAction("suggestTags")}
											disabled={anyAiLoading}
											className="gap-2 text-xs"
										>
											<Tags className="h-3.5 w-3.5" strokeWidth={1.6} />
											Suggest tags
											{aiLoading?.suggestTags && (
												<Loader2
													className="ml-auto h-3 w-3 animate-spin"
													strokeWidth={1.6}
												/>
											)}
										</DropdownMenuItem>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						</GuestGate>
					)}

					{onExportNote && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className={sidebarIconButtonClass}
									aria-label="Export note"
								>
									<Download className="h-4 w-4" strokeWidth={1.5} />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-48 rounded-none shadow-none"
							>
								<DropdownMenuItem
									onSelect={() => onExportNote("md")}
									className="gap-2 text-xs"
								>
									<FileText className="h-3.5 w-3.5" strokeWidth={1.6} />
									Export as Markdown
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={() => onExportNote("html")}
									className="gap-2 text-xs"
								>
									<FileCode className="h-3.5 w-3.5" strokeWidth={1.6} />
									Export as HTML
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					<ToolbarTooltip label="Toggle metadata" shortcutId="notes.toggleMetadata">
						<button
							type="button"
							onClick={onToggleMetadata}
							className={sidebarIconButtonClass}
							aria-label="Toggle metadata"
						>
							<PanelRightToggleIcon size={16} strokeWidth={1.5} />
						</button>
					</ToolbarTooltip>
					{onOpenSettings && (
						<ToolbarTooltip label="Open settings" shortcutId="notes.settings">
							<button
								type="button"
								onClick={onOpenSettings}
								className={sidebarIconButtonClass}
								aria-label="Open settings"
							>
								<SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
							</button>
						</ToolbarTooltip>
					)}
				</div>
			</div>
		</TooltipProvider>
	);
});

function SparkleIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.6}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path
				d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.34a.5.5 0 0 1 0-.99L8.5 10.437A2 2 0 0 0 9.936 9l1.34-6.135a.5.5 0 0 1 .99 0L13.56 9A2 2 0 0 0 15 10.437l6.135 1.34a.5.5 0 0 1 0 .99L15 14.063A2 2 0 0 0 13.562 15.5l-1.34 6.135a.5.5 0 0 1-.99 0Z"
				stroke="hsl(43, 96%, 56%)"
				style={{ animation: "sparkle-float-up 2.4s ease-in-out infinite" }}
			/>
			<circle
				cx={12}
				cy={2.5}
				r={1.5}
				fill="#22d3ee"
				stroke="none"
				style={{ animation: "sparkle-float-down 2s ease-in-out infinite 0.15s" }}
			/>
			<circle
				cx={21.5}
				cy={12}
				r={1.5}
				fill="#34d399"
				stroke="none"
				style={{ animation: "sparkle-float-up 2.8s ease-in-out infinite 0.4s" }}
			/>
			<circle
				cx={12}
				cy={21.5}
				r={1.5}
				fill="#a78bfa"
				stroke="none"
				style={{ animation: "sparkle-float-down 2.2s ease-in-out infinite 0.9s" }}
			/>
			<circle
				cx={2.5}
				cy={12}
				r={1.5}
				fill="#f472b6"
				stroke="none"
				style={{ animation: "sparkle-float-up 3s ease-in-out infinite 0.6s" }}
			/>
		</svg>
	);
}
