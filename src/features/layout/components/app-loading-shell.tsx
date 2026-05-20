import {
	BookOpen,
	Bell,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Code,
	Database,
	FileText,
	FlaskConical,
	Folder,
	FolderOpen,
	Kanban,
	Palette,
	PanelRight,
	PanelTopClose,
	Plus,
	PenLine,
	Plug,
	Search,
	Settings2,
	Shield,
	Sidebar,
	SortDesc,
	UnfoldVertical,
	Sparkles,
	Tag,
	Type,
	User,
} from "lucide-react";
import { LayoutContainer } from "./layout-container";
import { cn } from "@/shared/lib/utils";
import { RawLogo } from "@/shared/icons/logo";
import { DESKTOP_SIDEBAR_MIN_WIDTH } from "@/features/notes/constants";
import { NewFolderNoteIcon, NewNoteIcon } from "@/features/notes/components/sidebar/header-icons";

type WorkspaceLoadingVariant = "notes" | "journal";

function DataLine({ className }: { className?: string }) {
	return <div aria-hidden="true" className={cn("bg-sidebar-foreground/[0.075]", className)} />;
}

function StaticControl({
	children,
	className,
}: {
	children?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"flex h-7 items-center justify-center border border-sidebar-border/70 bg-sidebar-accent/25 text-sidebar-foreground/48",
				className,
			)}
		>
			{children}
		</div>
	);
}

function LoadingRail({ active }: { active: WorkspaceLoadingVariant }) {
	const itemClass =
		"flex h-9 w-9 items-center justify-center rounded-lg border border-transparent";

	return (
		<>
			<aside className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar/95 md:flex">
				<div className="flex w-full flex-col items-center">
					<div className="flex h-11 w-full items-center justify-center border-b border-sidebar-border">
						<RawLogo
							variant="sidebar"
							size={34}
							className="text-sidebar-foreground/92"
						/>
					</div>
					<div className="mt-4 flex w-full flex-col items-center gap-4">
						<div
							className={cn(
								itemClass,
								active === "notes"
									? "bg-sidebar-accent/75 text-sidebar-accent-foreground"
									: "text-sidebar-foreground/52",
							)}
						>
							<FolderOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
						</div>
						<div
							className={cn(
								itemClass,
								active === "journal"
									? "bg-sidebar-accent/75 text-sidebar-accent-foreground"
									: "text-sidebar-foreground/52",
							)}
						>
							<BookOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
						</div>
					</div>
				</div>
				<div className="flex w-full flex-col items-center gap-3 pb-4">
					<div className={cn(itemClass, "text-sidebar-foreground/52")}>
						<Kanban className="h-[18px] w-[18px]" strokeWidth={1.6} />
					</div>
					<div className="h-px w-8 bg-sidebar-border" aria-hidden="true" />
					<div
						aria-hidden="true"
						className="h-9 w-9 rounded-full border border-sidebar-border bg-sidebar"
					/>
				</div>
			</aside>
			<div aria-hidden="true" className="hidden w-14 shrink-0 md:block" />
		</>
	);
}

function MobileTopBar({ variant, title }: { variant: WorkspaceLoadingVariant; title: string }) {
	return (
		<div className="border-b border-border bg-card px-3 pb-3 pt-[max(env(safe-area-inset-top),0.85rem)] sm:px-4 md:hidden">
			<div className="flex items-center gap-2.5 sm:gap-3">
				<div className="flex h-11 items-center gap-1 border border-border bg-background px-1">
					<StaticControl className="h-11 w-11 border-transparent bg-transparent">
						<Sidebar className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
					<StaticControl className="h-11 w-11 border-transparent bg-transparent">
						<ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
					<StaticControl className="h-11 w-11 border-transparent bg-transparent">
						{variant === "notes" ? (
							<ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.7} />
						) : (
							<CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.7} />
						)}
					</StaticControl>
				</div>

				<div className="flex h-11 min-w-0 flex-1 items-center border border-border bg-background px-4">
					<div className="min-w-0">
						<div className="truncate text-[10px] text-muted-foreground/70">
							{variant === "notes" ? "Notes" : "Journal"}
						</div>
						<div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground/70">
							{title}
						</div>
					</div>
				</div>

				<div className="flex h-11 items-center gap-1.5 sm:gap-2">
					<StaticControl className="h-11 w-11 shrink-0 border-border bg-background">
						{variant === "notes" ? (
							<Code className="h-[18px] w-[18px]" strokeWidth={1.7} />
						) : (
							<Plus className="h-[18px] w-[18px]" strokeWidth={1.7} />
						)}
					</StaticControl>
					<StaticControl className="h-11 w-11 shrink-0 border-border bg-background">
						{variant === "notes" ? (
							<PanelRight className="h-[18px] w-[18px]" strokeWidth={1.7} />
						) : (
							<Settings2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
						)}
					</StaticControl>
					{variant === "notes" ? (
						<StaticControl className="h-11 w-11 shrink-0 border-border bg-background">
							<Settings2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
						</StaticControl>
					) : null}
				</div>
			</div>
		</div>
	);
}

function SidebarDataRows({ variant }: { variant: WorkspaceLoadingVariant }) {
	const rows =
		variant === "journal"
			? ["Today", "Yesterday", "This week", "Ideas", "Work log", "Private"]
			: ["Start here", "Inbox", "Projects", "Writing", "References", "Archive"];

	return (
		<div className="space-y-1.5">
			{rows.map((label, index) => {
				const Icon = variant === "journal" ? CalendarDays : index === 2 ? Folder : FileText;

				return (
					<div
						key={label}
						className="flex h-8 items-center gap-2 px-2 text-sidebar-foreground/36"
					>
						<Icon className="h-4 w-4 shrink-0" strokeWidth={1.45} />
						<span className="text-[12px] leading-none">{label}</span>
						{index < 3 ? <DataLine className="ml-auto h-px w-8" /> : null}
					</div>
				);
			})}
		</div>
	);
}

function SidebarHeaderIcon({ children }: { children: React.ReactNode }) {
	return (
		<div
			aria-hidden="true"
			className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60"
		>
			{children}
		</div>
	);
}

function JournalSidebarSkeleton() {
	const journalTabs = [CalendarDays, SortDesc, Search, FileText, Tag];
	const weekdayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
	const days = Array.from({ length: 35 }, (_, index) => index + 1);

	return (
		<div
			className="hidden shrink-0 border-r border-sidebar-border bg-background text-foreground md:flex md:flex-col"
			style={{ width: DESKTOP_SIDEBAR_MIN_WIDTH, minWidth: DESKTOP_SIDEBAR_MIN_WIDTH }}
		>
			<div className="flex h-11 items-center justify-between border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground">
				<h2 className="text-sm font-semibold text-foreground/78">Journal</h2>
				<div className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-sidebar-foreground/50">
					<CalendarDays className="h-3 w-3" strokeWidth={1.5} />
					Today
				</div>
			</div>

			<div
				role="tablist"
				aria-label="Journal sidebar views loading"
				className="flex h-11 items-center border-b border-border px-2"
			>
				{journalTabs.map((Icon, index) => (
					<div
						key={index}
						className={cn(
							"flex h-7 w-7 items-center justify-center rounded-md",
							index === 0
								? "border border-border bg-muted text-foreground/70"
								: "text-muted-foreground/55",
						)}
					>
						<Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
					</div>
				))}
			</div>

			<div className="flex-1 overflow-hidden p-2">
				<div className="mb-2 flex items-center gap-1.5">
					<StaticControl className="h-7 w-7 border-transparent bg-transparent text-muted-foreground/50">
						<ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
					</StaticControl>
					<StaticControl className="h-7 w-7 border-transparent bg-transparent text-muted-foreground/50">
						<ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
					</StaticControl>
					<div className="ml-1 flex h-7 items-center border border-border/70 bg-background px-2 text-[10px] font-medium text-muted-foreground/55">
						Today
					</div>
					<div className="ml-auto flex h-7 items-center gap-1.5 border border-border/70 bg-background px-2 text-[10px] font-medium text-muted-foreground/55">
						<CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} />
						18 May 2026
					</div>
				</div>

				<div className="mb-1 flex items-center justify-between">
					<span className="text-[11px] font-semibold text-foreground/65">May 2026</span>
				</div>

				<div className="grid grid-cols-7 gap-0">
					{weekdayLabels.map((label) => (
						<div
							key={label}
							className="flex h-6 items-center justify-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50"
						>
							{label}
						</div>
					))}
				</div>

				<div className="grid grid-cols-7 gap-0.5">
					{days.map((day) => (
						<div
							key={day}
							className={cn(
								"relative flex h-7 items-center justify-center border border-transparent text-[11px]",
								day === 18
									? "border-border bg-muted font-semibold text-foreground/70"
									: "text-foreground/45",
							)}
						>
							{day <= 31 ? day : ""}
							{day === 18 ? (
								<span className="absolute bottom-0.5 left-1/2 h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-background/60" />
							) : null}
						</div>
					))}
				</div>

				<div className="mt-3">
					<p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">
						This month
					</p>
					<div className="space-y-0.5">
						{["18 05 2026", "17 05 2026", "16 05 2026"].map((label) => (
							<div
								key={label}
								className="flex items-center gap-1.5 border border-transparent px-2 py-1.5"
							>
								<span className="w-[72px] shrink-0 text-[10px] font-medium text-muted-foreground/50">
									{label}
								</span>
								<DataLine className="h-px flex-1 bg-foreground/[0.07]" />
							</div>
						))}
					</div>
				</div>
			</div>

			<div className="border-t border-border p-2">
				<div className="flex w-full items-center justify-center gap-1.5 border border-border bg-background px-2 py-2 text-[11px] font-medium text-foreground/60">
					<Plus className="h-3 w-3" strokeWidth={2} />
					New entry
				</div>
			</div>
		</div>
	);
}

export function WorkspaceSidebarSkeleton({ variant }: { variant: WorkspaceLoadingVariant }) {
	if (variant === "journal") {
		return <JournalSidebarSkeleton />;
	}

	return (
		<div
			className="hidden shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col"
			style={{ width: DESKTOP_SIDEBAR_MIN_WIDTH, minWidth: DESKTOP_SIDEBAR_MIN_WIDTH }}
		>
			<div className="flex h-11 items-center justify-between overflow-hidden border-b border-sidebar-border px-3">
				<div className="flex h-full w-full items-center justify-between gap-3">
					<div className="flex items-center gap-2 md:gap-2.5 w-full justify-between">
						<SidebarHeaderIcon>
							<NewNoteIcon className="h-4 w-4" />
						</SidebarHeaderIcon>
						<SidebarHeaderIcon>
							<NewFolderNoteIcon className="h-4 w-4" />
						</SidebarHeaderIcon>
						<SidebarHeaderIcon>
							<PanelTopClose className="h-4 w-4" strokeWidth={1.5} />
						</SidebarHeaderIcon>
						<SidebarHeaderIcon>
							<UnfoldVertical className="h-4 w-4" strokeWidth={1.5} />
						</SidebarHeaderIcon>
						<SidebarHeaderIcon>
							<Search className="h-4 w-4" strokeWidth={1.5} />
						</SidebarHeaderIcon>
					</div>
				</div>
			</div>
			<div className="space-y-5 p-3">
				<div className="space-y-2">
					<div className="px-2 text-[10px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/32">
						Notes
					</div>
					<SidebarDataRows variant={variant} />
				</div>
			</div>
		</div>
	);
}

export function WorkspaceContentSkeleton({ variant }: { variant: WorkspaceLoadingVariant }) {
	if (variant === "journal") {
		return (
			<div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
				<MobileTopBar variant="journal" title="Entries" />
				<div className="flex h-11 items-center border-b border-border px-3 md:hidden">
					<div className="flex items-center gap-1 overflow-x-auto">
						{["All", "Daily", "Tagged", "Mood"].map((label) => (
							<span
								key={label}
								className={cn(
									"flex h-7 shrink-0 items-center px-3 text-[12px] font-medium",
									label === "All"
										? "text-foreground/70"
										: "text-muted-foreground/50",
								)}
							>
								{label}
							</span>
						))}
						<StaticControl className="ml-auto h-9 w-9 border-transparent bg-transparent">
							<Search className="h-3.5 w-3.5" strokeWidth={1.5} />
						</StaticControl>
						<StaticControl className="h-9 w-9 border-transparent bg-transparent">
							<SortDesc className="h-3.5 w-3.5" strokeWidth={1.5} />
						</StaticControl>
					</div>
				</div>
				<div className="flex-1 overflow-hidden px-3 md:hidden">
					<div className="mt-2">
						{Array.from({ length: 9 }, (_, index) => (
							<div
								key={index}
								className="flex h-[54px] items-center gap-3 border-b border-border px-1 py-2.5"
							>
								<span className="w-5 shrink-0 text-center text-[14px] text-muted-foreground/20">
									·
								</span>
								<DataLine className="h-px flex-1 bg-foreground/[0.08]" />
								<span className="shrink-0 text-[12px] text-muted-foreground/35">
									May {18 - index}
								</span>
							</div>
						))}
					</div>
				</div>

				<div className="hidden h-11 items-center border-b border-sidebar-border border-l bg-sidebar px-3 md:flex">
					<div className="flex items-center gap-2">
						<StaticControl className="w-7">
							<Sidebar className="h-4 w-4" strokeWidth={1.5} />
						</StaticControl>
						<StaticControl className="w-7">
							<CalendarDays className="h-4 w-4" strokeWidth={1.5} />
						</StaticControl>
					</div>
					<div className="flex flex-1 justify-center gap-3 text-sm">
						<span className="text-sidebar-foreground/50">Journal</span>
						<span className="font-medium text-sidebar-foreground/68">Entries</span>
					</div>
					<div className="flex items-center gap-1">
						<StaticControl className="w-7">
							<Search className="h-4 w-4" strokeWidth={1.5} />
						</StaticControl>
						<StaticControl className="w-16">
							<Plus className="mr-1 h-3.5 w-3.5" strokeWidth={1.7} />
							<span className="text-[11px]">New</span>
						</StaticControl>
					</div>
				</div>
				<div className="hidden flex-col md:flex">
					<div className="flex h-11 items-center gap-2 border-b border-border px-2">
						<div className="flex items-center gap-0.5 overflow-x-auto">
							{["All", "Daily", "Tagged", "Mood"].map((label) => (
								<span
									key={label}
									className={cn(
										"flex h-7 items-center px-3 text-[13px] font-medium",
										label === "All"
											? "text-foreground/70"
											: "text-muted-foreground/50",
									)}
								>
									{label}
								</span>
							))}
						</div>
					</div>
				</div>
				<div className="hidden flex-1 overflow-hidden md:block">
					{Array.from({ length: 10 }, (_, index) => (
						<div
							key={index}
							className="flex h-[54px] items-center gap-3 border-b border-border px-4 py-2.5"
						>
							<span className="w-5 shrink-0 text-center text-[14px] text-muted-foreground/20">
								·
							</span>
							<DataLine className="h-px flex-1 bg-foreground/[0.08]" />
							<span className="shrink-0 text-[12px] text-muted-foreground/35">
								May {18 - index}
							</span>
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
			<MobileTopBar variant="notes" title="Loading note data" />
			<div className="flex min-h-0 flex-1 overflow-hidden md:hidden">
				<div className="flex min-h-full flex-1 flex-col overflow-y-auto bg-card">
					<div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-8 sm:py-8">
						<div className="space-y-5">
							<DataLine className="h-px w-full bg-foreground/[0.08]" />
							<DataLine className="h-px w-11/12 bg-foreground/[0.07]" />
							<DataLine className="h-px w-7/12 bg-foreground/[0.06]" />
						</div>
					</div>
				</div>
			</div>
			<div className="hidden h-11 items-center gap-1 border-b border-l border-sidebar-border bg-sidebar pl-2 pr-3 md:flex">
				<div className="flex items-center gap-2">
					<StaticControl className="w-7">
						<Sidebar className="h-4 w-4" strokeWidth={1.5} />
					</StaticControl>
					<StaticControl className="w-7">
						<ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
					</StaticControl>
					<StaticControl className="w-7">
						<ChevronRight className="h-4 w-4" strokeWidth={1.5} />
					</StaticControl>
				</div>
				<div className="ml-2 min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground/58">
					Loading note data
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<StaticControl className="w-7">
						<Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />
					</StaticControl>
					<StaticControl className="w-[108px]">
						<Type className="h-3 w-3" strokeWidth={1.6} />
						<span className="ml-1 text-[11px]">Block</span>
						<Code className="ml-2 h-3 w-3" strokeWidth={1.6} />
						<span className="ml-1 text-[11px]">Raw</span>
					</StaticControl>
					<div className="mx-0.5 h-5 w-px bg-sidebar-border/60" />
					<StaticControl className="w-7">
						<PanelRight className="h-4 w-4" strokeWidth={1.5} />
					</StaticControl>
					<StaticControl className="w-7">
						<Settings2 className="h-4 w-4" strokeWidth={1.5} />
					</StaticControl>
				</div>
			</div>
			<div className="hidden min-h-0 flex-1 md:flex">
				<div className="flex min-h-full min-w-0 flex-1 flex-col overflow-y-auto bg-card">
					<div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-8 sm:py-8">
						<div className="space-y-5">
							<DataLine className="h-px w-full bg-foreground/[0.08]" />
							<DataLine className="h-px w-10/12 bg-foreground/[0.07]" />
							<DataLine className="h-px w-7/12 bg-foreground/[0.06]" />
						</div>
					</div>
				</div>
				<div className="hidden w-72 shrink-0 border-l border-border bg-background xl:w-80 lg:block">
					<div className="border-b border-border px-4 py-4">
						<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
							<FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
							Details
						</div>
					</div>
					<div className="space-y-4 px-4 py-4">
						<DataLine className="h-px w-full bg-foreground/[0.08]" />
						<DataLine className="h-px w-5/6 bg-foreground/[0.07]" />
						<DataLine className="h-px w-3/5 bg-foreground/[0.06]" />
					</div>
				</div>
			</div>
		</div>
	);
}

function SettingsLoadingRail() {
	const itemClass =
		"flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-sidebar-foreground/52";
	return (
		<>
			<aside className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar/95 md:flex">
				<div className="flex w-full flex-col items-center">
					<div className="flex h-11 w-full items-center justify-center border-b border-sidebar-border">
						<RawLogo
							variant="sidebar"
							size={34}
							className="text-sidebar-foreground/92"
						/>
					</div>
					<div className="mt-4 flex w-full flex-col items-center gap-4">
						<div className={itemClass}>
							<FolderOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
						</div>
						<div className={itemClass}>
							<BookOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
						</div>
					</div>
				</div>
				<div className="flex w-full flex-col items-center gap-3 pb-4">
					<div className={itemClass}>
						<Kanban className="h-[18px] w-[18px]" strokeWidth={1.6} />
					</div>
					<div className="h-px w-8 bg-sidebar-border" aria-hidden="true" />
					<div
						aria-hidden="true"
						className="h-9 w-9 rounded-full border border-sidebar-border bg-sidebar"
					/>
				</div>
			</aside>
			<div aria-hidden="true" className="hidden w-14 shrink-0 md:block" />
		</>
	);
}

export function SettingsLoadingShell() {
	const items: Array<{ label: string; Icon: typeof User; active?: boolean }> = [
		{ label: "Account", Icon: User, active: true },
		{ label: "Appearance", Icon: Palette },
		{ label: "Editor", Icon: PenLine },
		{ label: "Notifications", Icon: Bell },
		{ label: "Data & sync", Icon: Database },
		{ label: "Integrations", Icon: Plug },
		{ label: "Security", Icon: Shield },
		{ label: "AI", Icon: Sparkles },
		{ label: "Tags", Icon: Tag },
		{ label: "Experimental", Icon: FlaskConical },
	];

	return (
		<LayoutContainer className="bg-background">
			{/* Mobile skeleton — iOS-style settings list */}
			<div className="flex min-h-0 flex-1 flex-col md:hidden">
				<header
					className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-background/95 px-2 backdrop-blur"
					style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}
				>
					<div className="flex h-12 w-20 items-center px-2 text-[15px] font-medium text-muted-foreground/60">
						Back
					</div>
					<h1 className="text-[17px] font-semibold tracking-tight text-foreground/80">
						Settings
					</h1>
					<div className="h-12 w-20" aria-hidden="true" />
				</header>
				<div
					className="flex-1 overflow-y-auto"
					style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
				>
					<ul
						aria-hidden="true"
						className="divide-y divide-border border-b border-border"
					>
						{items.map(({ label, Icon }) => (
							<li key={label}>
								<div className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3.5">
									<span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-muted/40 text-foreground/60">
										<Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
									</span>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="text-[15px] font-medium leading-tight text-foreground/70">
											{label}
										</span>
										<DataLine className="mt-1.5 h-2.5 w-32 max-w-full" />
									</span>
								</div>
							</li>
						))}
					</ul>
				</div>
			</div>

			{/* Desktop skeleton */}
			<div className="relative hidden min-h-0 flex-1 overflow-hidden md:flex">
				<SettingsLoadingRail />

				<div
					className="hidden shrink-0 flex-col border-r border-border bg-background md:flex"
					style={{ width: 220 }}
				>
					<div className="flex h-11 items-center border-b border-sidebar-border bg-sidebar px-3">
						<span className="text-sm font-semibold text-foreground/70">Settings</span>
					</div>
					<nav aria-hidden="true" className="flex-1 overflow-y-auto p-2">
						<ul className="space-y-0.5">
							{items.map(({ label, Icon, active }) => (
								<li key={label}>
									<div
										className={cn(
											"flex w-full items-center gap-2 border px-2.5 py-2 text-[12px] font-medium",
											active
												? "border-border bg-muted text-foreground/80"
												: "border-transparent text-muted-foreground/60",
										)}
									>
										<Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
										<span className="truncate">{label}</span>
									</div>
								</li>
							))}
						</ul>
					</nav>
				</div>

				<main className="flex min-w-0 flex-1 flex-col overflow-hidden">
					<div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
						<div className="mx-auto w-full max-w-3xl">
							<div className="mb-8">
								<div className="h-7 w-32 bg-foreground/[0.08]" />
								<div className="mt-2 h-3.5 w-72 max-w-full bg-foreground/[0.05]" />
							</div>
							<div className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 p-5">
								<div className="size-14 shrink-0 rounded-full border border-sidebar-border bg-sidebar" />
								<div className="min-w-0 flex-1 space-y-2">
									<DataLine className="h-px w-36" />
									<DataLine className="h-px w-48" />
								</div>
								<div className="h-8 w-28 border border-border bg-background" />
							</div>
							<div className="mb-2 mt-8 h-3 w-16 bg-foreground/[0.06]" />
							<div className="rounded-lg border border-border/60 bg-card/40 px-5">
								{Array.from({ length: 3 }, (_, index) => (
									<div
										key={index}
										className="flex items-start justify-between gap-6 border-b border-border/50 py-4 last:border-b-0"
									>
										<div className="min-w-0 flex-1 space-y-2">
											<DataLine className="h-px w-32" />
											<DataLine className="h-px w-56" />
										</div>
										<div className="h-8 w-52 shrink-0 border border-border bg-background" />
									</div>
								))}
							</div>
						</div>
					</div>
				</main>
			</div>
		</LayoutContainer>
	);
}

export function WorkspaceLoadingShell({ variant }: { variant: WorkspaceLoadingVariant }) {
	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<LoadingRail active={variant} />
				<WorkspaceSidebarSkeleton variant={variant} />
				<WorkspaceContentSkeleton variant={variant} />
			</div>
		</LayoutContainer>
	);
}
