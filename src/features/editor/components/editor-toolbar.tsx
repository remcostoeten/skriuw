import {
	ChevronLeft,
	ChevronRight,
	Columns2,
	Loader2,
	PanelLeft,
	PanelRight,
	PenTool,
	Rows2,
	Settings2,
	Sidebar,
	SlidersHorizontal,
	SpellCheck,
	Wand2,
} from "lucide-react";
import Link from "next/link";
import type { Awareness } from "y-protocols/awareness";
import { cn } from "@/shared/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { GuestGate } from "@/shared/ui/guest-gate";
import { CollabPresence } from "@/features/collaboration/components/collab-presence";

export type WorkspaceNavItem = {
	href: string;
	label: string;
	isActive?: boolean;
};

type Props = {
	fileName: string;
	breadcrumb?: string[];
	isMobile?: boolean;
	workspaceItems?: WorkspaceNavItem[];
	onToggleSidebar: () => void;
	onToggleMetadata: () => void;
	onOpenSettings?: () => void;
	onNavigatePrev?: () => void;
	onNavigateNext?: () => void;
	canNavigatePrev?: boolean;
	canNavigateNext?: boolean;
	aiLoading?: { generateTitle: boolean; spellCheck: boolean; continueWriting: boolean };
	onAiGenerateTitle?: () => void;
	onAiSpellCheck?: () => void;
	onAiContinueWriting?: () => void;
	splitEnabled?: boolean;
	onToggleSplit?: () => void;
	canToggleSplit?: boolean;
	splitOrientation?: "vertical" | "horizontal";
	onToggleSplitOrientation?: () => void;
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
					title="Workspaces"
					aria-label="Workspaces"
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

export function EditorToolbar({
	fileName,
	breadcrumb,
	isMobile = false,
	workspaceItems = [],
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
	splitEnabled,
	onToggleSplit,
	canToggleSplit = true,
	splitOrientation = "vertical",
	onToggleSplitOrientation,
	presenceAwareness,
}: Props) {
	const anyAiLoading = aiLoading
		? aiLoading.generateTitle || aiLoading.spellCheck || aiLoading.continueWriting
		: false;
	const hasAiActions = Boolean(onAiGenerateTitle || onAiSpellCheck || onAiContinueWriting);
	const sidebarIconButtonClass =
		"pressable flex h-8 w-8 items-center justify-center border border-transparent text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted hover:text-foreground";

	const runAiAction = (handler?: () => void) => () => {
		handler?.();
	};

	if (isMobile) {
		const mobileIconButton =
			"flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]";

		return (
			<header className="border-b border-border bg-card px-2 pb-2.5 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-3">
				<div className="flex min-h-11 items-center gap-0.5">
					<button
						onClick={onToggleSidebar}
						className={mobileIconButton}
						title="Open notes"
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
							{fileName}
						</h1>
					</div>

					<CollabPresence awareness={presenceAwareness} />

					<button
						onClick={onToggleMetadata}
						className={mobileIconButton}
						title="Open note details"
						aria-label="Open note details"
					>
						<PanelRight className="h-5 w-5" strokeWidth={1.7} />
					</button>
					{onOpenSettings ? (
						<button
							onClick={onOpenSettings}
							className={mobileIconButton}
							title="Open settings"
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
		<div
			className={cn(
				"border-b border-border bg-background text-foreground",
				"flex h-11 items-center gap-1 px-3",
			)}
		>
			<button
				onClick={onToggleSidebar}
				className={sidebarIconButtonClass}
				title="Toggle sidebar"
				aria-label="Toggle sidebar"
			>
				<PanelLeft className="h-4 w-4" strokeWidth={1.5} />
			</button>
			<WorkspaceMenu items={workspaceItems} buttonClassName={sidebarIconButtonClass} />
			<button
				onClick={onNavigatePrev}
				disabled={!canNavigatePrev}
				className={cn(
					sidebarIconButtonClass,
					!canNavigatePrev && "cursor-not-allowed text-muted-foreground/30",
				)}
				title="Previous file"
				aria-label="Previous file"
			>
				<ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
			</button>
			<button
				onClick={onNavigateNext}
				disabled={!canNavigateNext}
				className={cn(
					sidebarIconButtonClass,
					!canNavigateNext && "cursor-not-allowed text-muted-foreground/30",
				)}
				title="Next file"
				aria-label="Next file"
			>
				<ChevronRight className="h-4 w-4" strokeWidth={1.5} />
			</button>

			<div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 text-sm">
				{breadcrumb && breadcrumb.length > 0 && (
					<>
						{breadcrumb.map((part, i) => (
							<span key={i} className="flex shrink-0 items-center gap-1.5">
								<span className="text-muted-foreground/50 truncate">{part}</span>
								<span className="text-muted-foreground/50">/</span>
							</span>
						))}
					</>
				)}
				<span className="text-muted-foreground/50 truncate font-medium ">{fileName}</span>
			</div>

			<div className="flex shrink-0 items-center gap-1">
				<CollabPresence awareness={presenceAwareness} />
				{onToggleSplit && (
					<button
						type="button"
						onClick={onToggleSplit}
						disabled={!canToggleSplit}
						className={cn(
							sidebarIconButtonClass,
							splitEnabled &&
								"border-border bg-muted text-foreground hover:bg-muted",
							!canToggleSplit && "cursor-not-allowed text-muted-foreground/30",
						)}
						title={splitEnabled ? "Close split editor" : "Split editor"}
						aria-label={splitEnabled ? "Close split editor" : "Split editor"}
						aria-pressed={splitEnabled}
					>
						<Columns2 className="h-4 w-4" strokeWidth={1.5} />
					</button>
				)}
				{splitEnabled && onToggleSplitOrientation ? (
					<button
						type="button"
						onClick={onToggleSplitOrientation}
						className={sidebarIconButtonClass}
						title={
							splitOrientation === "vertical"
								? "Switch to horizontal split"
								: "Switch to vertical split"
						}
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
								disabled={anyAiLoading}
								className={cn(
									sidebarIconButtonClass,
									"text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
									anyAiLoading && "cursor-not-allowed opacity-50",
								)}
								title="AI actions"
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
						<DropdownMenuContent align="end" className="w-52 rounded-none shadow-none animate-in fade-in-80">
							{onAiGenerateTitle && (
								<DropdownMenuItem
									onSelect={runAiAction(onAiGenerateTitle)}
									disabled={anyAiLoading}
									className="gap-2 text-xs"
								>
									<Wand2
										className="h-3.5 w-3.5"
										strokeWidth={1.6}
									/>
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
									<SpellCheck
										className="h-3.5 w-3.5"
										strokeWidth={1.6}
									/>
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
									<PenTool
										className="h-3.5 w-3.5"
										strokeWidth={1.6}
									/>
									Continue writing
									{aiLoading?.continueWriting && (
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

				<button
					onClick={onToggleMetadata}
					className={sidebarIconButtonClass}
					title="Toggle metadata"
					aria-label="Toggle metadata"
				>
					<PanelRight className="h-4 w-4" strokeWidth={1.5} />
				</button>
				{onOpenSettings && (
					<button
						onClick={onOpenSettings}
						className={sidebarIconButtonClass}
						title="Open settings"
						aria-label="Open settings"
					>
						<SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
					</button>
				)}
			</div>
		</div>
	);
}

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
			<circle cx={12} cy={2.5} r={1.5} fill="#22d3ee" stroke="none"
				style={{ animation: "sparkle-float-down 2s ease-in-out infinite 0.15s" }} />
			<circle cx={21.5} cy={12} r={1.5} fill="#34d399" stroke="none"
				style={{ animation: "sparkle-float-up 2.8s ease-in-out infinite 0.4s" }} />
			<circle cx={12} cy={21.5} r={1.5} fill="#a78bfa" stroke="none"
				style={{ animation: "sparkle-float-down 2.2s ease-in-out infinite 0.9s" }} />
			<circle cx={2.5} cy={12} r={1.5} fill="#f472b6" stroke="none"
				style={{ animation: "sparkle-float-up 3s ease-in-out infinite 0.6s" }} />
		</svg>
	);
}
