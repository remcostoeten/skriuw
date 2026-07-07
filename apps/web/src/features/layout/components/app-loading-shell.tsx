import {
	Bell,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Columns2,
	Database,
	FileText,
	FlaskConical,
	Palette,
	PanelLeft,
	PanelRight,
	PenLine,
	Plus,
	Plug,
	Search,
	Settings2,
	Shield,
	Sidebar,
	SlidersHorizontal,
	SortDesc,
	Sparkles,
	Tag,
	User,
} from "lucide-react";
import { LayoutContainer } from "./layout-container";
import { IconRailSkeleton } from "./icon-rail-skeleton";
import { cn } from "@/shared/lib/utils";
import { DESKTOP_SIDEBAR_MIN_WIDTH } from "@/features/notes/constants";
import {
	DetailsPanelSkeleton,
	EditorContentSkeleton,
} from "@/features/editor/components/editor-content-skeleton";
import { JournalContentSkeleton } from "@/features/journal/components/journal-content-skeleton";
import { NotesSidebarSkeleton } from "@/features/notes/components/sidebar/notes-sidebar-skeleton";

type WorkspaceLoadingVariant = "notes" | "journal";

const JOURNAL_TAB_ICONS = [CalendarDays, SortDesc, Search, FileText, Tag];
const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const SETTINGS_NAV_ITEMS: Array<{ label: string; Icon: typeof User; active?: boolean }> = [
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

function DataLine({ className, style }: { className?: string; style?: React.CSSProperties }) {
	return (
		<div
			aria-hidden="true"
			className={cn("bg-sidebar-foreground/[0.075]", className)}
			style={style}
		/>
	);
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
				"inline-flex items-center justify-center text-sidebar-foreground/48",
				className,
			)}
		>
			{children}
		</div>
	);
}

function StaticIconButton({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"inline-flex items-center justify-center text-muted-foreground/55",
				className,
			)}
		>
			{children}
		</div>
	);
}

function MobileTopBar({ variant, title }: { variant: WorkspaceLoadingVariant; title: string }) {
	if (variant === "notes") {
		return (
			<header className="border-b border-border bg-card px-2 pb-2.5 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-3 md:hidden">
				<div className="flex min-h-11 items-center gap-0.5">
					<StaticControl className="h-11 w-11 shrink-0">
						<Sidebar className="h-5 w-5" strokeWidth={1.7} />
					</StaticControl>
					<div className="min-w-0 flex-1 px-1.5">
						<div className="truncate text-[17px] font-semibold leading-snug tracking-[-0.02em] text-foreground/70">
							{title}
						</div>
					</div>
					<StaticControl className="h-11 w-11 shrink-0">
						<PanelRight className="h-5 w-5" strokeWidth={1.7} />
					</StaticControl>
					<StaticControl className="h-11 w-11 shrink-0">
						<Settings2 className="h-5 w-5" strokeWidth={1.7} />
					</StaticControl>
				</div>
			</header>
		);
	}

	return (
		<div className="border-b border-border bg-card px-3 pb-3 pt-[max(env(safe-area-inset-top),0.85rem)] sm:px-4 md:hidden">
			<div className="flex items-center gap-2.5 sm:gap-3">
				<div className="flex h-11 items-center gap-1 px-1">
					<StaticControl className="h-11 w-11">
						<Sidebar className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
					<StaticControl className="h-11 w-11">
						<ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
					<StaticControl className="h-11 w-11">
						<CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
				</div>

				<div className="flex h-11 min-w-0 flex-1 items-center px-4">
					<div className="min-w-0">
						<div className="truncate text-[10px] text-muted-foreground/70">Journal</div>
						<div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground/70">
							{title}
						</div>
					</div>
				</div>

				<div className="flex h-11 items-center gap-1.5 sm:gap-2">
					<StaticControl className="h-11 w-11 shrink-0">
						<Plus className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
					<StaticControl className="h-11 w-11 shrink-0">
						<Settings2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
				</div>
			</div>
		</div>
	);
}

function JournalSidebarSkeleton() {
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
				{JOURNAL_TAB_ICONS.map((Icon, index) => (
					<div
						key={Icon.name}
						className={cn(
							"flex h-7 w-7 items-center justify-center",
							index === 0 ? "text-foreground/70" : "text-muted-foreground/55",
						)}
					>
						<Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
					</div>
				))}
			</div>

			<div className="flex-1 overflow-hidden p-2">
				<div className="mb-2 flex items-center gap-1.5">
					<StaticControl className="h-7 w-7 text-muted-foreground/50">
						<ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
					</StaticControl>
					<StaticControl className="h-7 w-7 text-muted-foreground/50">
						<ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
					</StaticControl>
					<div className="ml-1 flex h-7 items-center px-2 text-[10px] font-medium text-muted-foreground/55">
						Today
					</div>
					<div className="ml-auto flex h-7 items-center gap-1.5 px-2 text-[10px] font-medium text-muted-foreground/55">
						<CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} />
						18 May 2026
					</div>
				</div>

				<div className="mb-1 flex items-center justify-between">
					<span className="text-[11px] font-semibold text-foreground/65">May 2026</span>
				</div>

				<div className="grid grid-cols-7 gap-0">
					{WEEKDAY_LABELS.map((label) => (
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
				<div className="flex w-full items-center justify-center gap-1.5 px-2 py-2 text-[11px] font-medium text-foreground/60">
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

	return <NotesSidebarSkeleton />;
}

function WorkspaceContentSkeleton({ variant }: { variant: WorkspaceLoadingVariant }) {
	if (variant === "journal") {
		return <JournalContentSkeleton view="list" />;
	}

	return (
		<div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
			<MobileTopBar variant="notes" title="Loading note data" />
			<div className="flex min-h-0 flex-1 overflow-hidden md:hidden">
				<div className="flex min-h-full flex-1 flex-col overflow-y-auto bg-card">
					<EditorContentSkeleton />
				</div>
			</div>
			<div className="hidden h-11 items-center gap-1 border-b border-border bg-background px-3 text-foreground md:flex">
				<StaticIconButton>
					<PanelLeft className="h-4 w-4" strokeWidth={1.5} />
				</StaticIconButton>
				<StaticIconButton>
					<ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
				</StaticIconButton>
				<StaticIconButton>
					<ChevronRight className="h-4 w-4" strokeWidth={1.5} />
				</StaticIconButton>

				<div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 text-sm">
					<span className="truncate font-medium text-muted-foreground/50">
						Loading note data
					</span>
				</div>

				<div className="flex shrink-0 items-center gap-1">
					<StaticIconButton>
						<Columns2 className="h-4 w-4" strokeWidth={1.5} />
					</StaticIconButton>
					<StaticIconButton>
						<Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />
					</StaticIconButton>
					<StaticIconButton>
						<PanelRight className="h-4 w-4" strokeWidth={1.5} />
					</StaticIconButton>
					<StaticIconButton>
						<SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
					</StaticIconButton>
				</div>
			</div>
			<div className="hidden min-h-0 flex-1 md:flex">
				<div className="flex min-h-full min-w-0 flex-1 flex-col overflow-hidden">
					<div className="flex-1 overflow-y-auto bg-card">
						<EditorContentSkeleton />
					</div>
					<div className="flex h-8 shrink-0 items-center border-t border-border bg-card px-4 text-[11px] text-muted-foreground/55">
						<div className="flex min-w-0 flex-1 items-center gap-3">
							<span className="tabular-nums">0 words</span>
							<span className="h-4 w-px bg-border" aria-hidden="true" />
							<span>Block editor</span>
						</div>
					</div>
				</div>
				<div className="w-72 shrink-0 border-l border-border bg-background xl:w-80">
					<DetailsPanelSkeleton />
				</div>
			</div>
		</div>
	);
}

function SettingsLoadingRail() {
	return <IconRailSkeleton />;
}

function SettingsLoadingShell() {
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
						{SETTINGS_NAV_ITEMS.map(({ label, Icon }) => (
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
							{SETTINGS_NAV_ITEMS.map(({ label, Icon, active }) => (
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
	const activeHref = variant === "journal" ? "/app/journal" : "/app";

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<IconRailSkeleton activeHref={activeHref} />
				<WorkspaceSidebarSkeleton variant={variant} />
				<WorkspaceContentSkeleton variant={variant} />
			</div>
		</LayoutContainer>
	);
}
