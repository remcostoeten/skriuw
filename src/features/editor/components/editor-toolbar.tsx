import { useEffect, useState } from "react";
import {
	ChevronLeft,
	ChevronRight,
	Loader2,
	PanelLeft,
	PanelRight,
	PenTool,
	Settings2,
	Sidebar,
	SlidersHorizontal,
	SpellCheck,
	Wand2,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

type Props = {
	fileName: string;
	breadcrumb?: string[];
	isMobile?: boolean;
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
};

export function EditorToolbar({
	fileName,
	breadcrumb,
	isMobile = false,
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
}: Props) {
	const [isMounted, setIsMounted] = useState(false);
	const anyAiLoading = aiLoading
		? aiLoading.generateTitle || aiLoading.spellCheck || aiLoading.continueWriting
		: false;
	const hasAiActions = Boolean(onAiGenerateTitle || onAiSpellCheck || onAiContinueWriting);
	const sidebarIconButtonClass =
		"pressable flex h-8 w-8 items-center justify-center border border-transparent text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted hover:text-foreground";

	useEffect(() => {
		setIsMounted(true);
	}, []);

	const runAiAction = (handler?: () => void) => () => {
		handler?.();
	};

	if (isMobile) {
		const mobileControlClass =
			"flex h-11 w-11 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground active:scale-[0.97]";

		return (
			<div className="border-b border-border bg-card px-3 pb-3 pt-[max(env(safe-area-inset-top),0.85rem)] sm:px-4">
				<div className="flex items-center gap-2.5 sm:gap-3">
					<div className="flex h-11 items-center gap-1 border border-border bg-background px-1">
						<button
							onClick={onToggleSidebar}
							className={mobileControlClass}
							title="Open notes"
							aria-label="Open notes"
						>
							<Sidebar className="h-[18px] w-[18px]" strokeWidth={1.7} />
						</button>
						<button
							onClick={onNavigatePrev}
							disabled={!canNavigatePrev}
							className={cn(
								mobileControlClass,
								!canNavigatePrev && "cursor-not-allowed text-muted-foreground/30",
							)}
							title="Previous file"
							aria-label="Previous file"
						>
							<ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.7} />
						</button>
						<button
							onClick={onNavigateNext}
							disabled={!canNavigateNext}
							className={cn(
								mobileControlClass,
								!canNavigateNext && "cursor-not-allowed text-muted-foreground/30",
							)}
							title="Next file"
							aria-label="Next file"
						>
							<ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.7} />
						</button>
					</div>

					<div className="flex h-11 min-w-0 flex-1 items-center border border-border bg-background px-4">
						<div className="min-w-0">
							{breadcrumb && breadcrumb.length > 0 && (
								<div className="truncate text-[10px] text-muted-foreground">
									{breadcrumb.join(" / ")}
								</div>
							)}
							<div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
								{fileName}
							</div>
						</div>
					</div>

					<div className="flex h-11 items-center gap-1.5 sm:gap-2">
						<button
							onClick={onToggleMetadata}
							className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
							title="Open note details"
							aria-label="Open note details"
						>
							<PanelRight className="h-[18px] w-[18px]" strokeWidth={1.7} />
						</button>
						<button
							onClick={onOpenSettings}
							className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
							title="Open settings"
							aria-label="Open settings"
						>
							<Settings2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
						</button>
					</div>
				</div>
			</div>
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
				{hasAiActions && !isMounted && (
					<button
						disabled
						className={cn(
							sidebarIconButtonClass,
							"text-sidebar-foreground/58 opacity-50",
						)}
						title="AI actions"
						aria-label="AI actions"
					>
						<SparkleIcon className="h-3.5 w-3.5" />
					</button>
				)}
				{hasAiActions && isMounted && (
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
						<DropdownMenuContent align="end" className="w-52 rounded-md shadow-xl animate-in fade-in-80">
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
