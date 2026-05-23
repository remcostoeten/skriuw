"use client";

import * as React from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
	AlertTriangle,
	Ban,
	Check,
	Copy,
	ExternalLink,
	Eye,
	LayoutGrid,
	Loader2,
	Lock,
	MoreHorizontal,
	RefreshCw,
	Rows3,
	Search,
	Trash2,
	User,
} from "lucide-react";

import type { TSharedNoteRow, TSharedNoteStatus, TSharedOverview } from "@/domain/sharing/models";
import { refreshNoteShareSnapshot, revokeNoteShare } from "@/domain/sharing/actions";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { EmptyState } from "@/shared/ui/empty-state";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { cn } from "@/shared/lib/utils";

import { formatDate, formatExpiry, formatRelativeTime, formatSpan, statusStyle } from "../lib/format";
import { ViewSparkline } from "./view-sparkline";

type ViewMode = "table" | "grid";
type StatusFilter = "all" | TSharedNoteStatus;

const FILTERS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "active", label: "Active" },
	{ id: "expired", label: "Expired" },
	{ id: "consumed", label: "Consumed" },
	{ id: "revoked", label: "Revoked" },
];

function fullUrl(row: TSharedNoteRow): string {
	if (row.url.startsWith("http")) return row.url;
	if (typeof window !== "undefined") return `${window.location.origin}${row.path}`;
	return row.path;
}

export function SharedNotesOverview({ overview }: { overview: TSharedOverview }) {
	const router = useRouter();
	const [view, setView] = useState<ViewMode>("table");
	const [filter, setFilter] = useState<StatusFilter>("all");
	const [query, setQuery] = useState("");
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [revokeTarget, setRevokeTarget] = useState<TSharedNoteRow | null>(null);
	const [, startTransition] = useTransition();

	const { rows, summary } = overview;

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((r) => {
			if (filter !== "all" && r.status !== filter) return false;
			if (q && !r.name.toLowerCase().includes(q)) return false;
			return true;
		});
	}, [rows, filter, query]);

	async function copyLink(row: TSharedNoteRow) {
		try {
			await navigator.clipboard.writeText(fullUrl(row));
			setCopiedId(row.noteId);
			setTimeout(() => setCopiedId((id) => (id === row.noteId ? null : id)), 1600);
		} catch {
			/* clipboard unavailable — ignore */
		}
	}

	async function runAction(noteId: string, fn: () => Promise<unknown>) {
		setBusyId(noteId);
		try {
			await fn();
			startTransition(() => router.refresh());
		} finally {
			setBusyId(null);
		}
	}

	const handleRefresh = (row: TSharedNoteRow) =>
		runAction(row.noteId, () => refreshNoteShareSnapshot(row.noteId));

	const confirmRevoke = async () => {
		if (!revokeTarget) return;
		const target = revokeTarget;
		setRevokeTarget(null);
		await runAction(target.noteId, () => revokeNoteShare(target.noteId));
	};

	if (rows.length === 0) {
		return (
			<div className="mx-auto w-full max-w-5xl px-6 py-12">
				<Header summary={summary} view={view} onView={setView} />
				<div className="mt-10">
					<EmptyState
						icon={Eye}
						title="No shared notes yet"
						description="Publish a note from the editor's share menu and it'll show up here with live view metrics."
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-5xl px-6 py-10">
			<Header summary={summary} view={view} onView={setView} />

			{/* Controls */}
			<div className="mt-6 flex flex-wrap items-center gap-2">
				<div className="flex items-center gap-1">
					{FILTERS.map((f) => {
						const count =
							f.id === "all" ? summary.total : summary[f.id as TSharedNoteStatus];
						if (f.id !== "all" && count === 0) return null;
						return (
							<button
								key={f.id}
								type="button"
								onClick={() => setFilter(f.id)}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
									filter === f.id
										? "border-border bg-muted text-foreground"
										: "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
								)}
							>
								{f.label}
								<span className="text-[11px] tabular-nums text-muted-foreground">
									{count}
								</span>
							</button>
						);
					})}
				</div>
				<div className="relative ml-auto">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search notes…"
						className="h-8 w-48 pl-8 text-[13px]"
					/>
				</div>
			</div>

			{filtered.length === 0 ? (
				<p className="mt-10 text-center text-sm text-muted-foreground">
					No shares match this filter.
				</p>
			) : view === "table" ? (
				<TableView
					rows={filtered}
					windowDays={summary.windowDays}
					expandedId={expandedId}
					onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
					busyId={busyId}
					copiedId={copiedId}
					onCopy={copyLink}
					onRefresh={handleRefresh}
					onRevoke={setRevokeTarget}
				/>
			) : (
				<GridView
					rows={filtered}
					windowDays={summary.windowDays}
					busyId={busyId}
					copiedId={copiedId}
					onCopy={copyLink}
					onRefresh={handleRefresh}
					onRevoke={setRevokeTarget}
				/>
			)}

			<RevokeDialog
				target={revokeTarget}
				onCancel={() => setRevokeTarget(null)}
				onConfirm={confirmRevoke}
			/>
		</div>
	);
}

// ── Header + summary ─────────────────────────────────────────────────────────

function Header({
	summary,
	view,
	onView,
}: {
	summary: TSharedOverview["summary"];
	view: ViewMode;
	onView: (v: ViewMode) => void;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-4">
			<div>
				<h1 className="text-xl font-semibold tracking-[-0.01em]">Shared notes</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Every public link you've created, with view activity over the last{" "}
					{summary.windowDays} days.
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
					<Stat value={summary.total} label="shared" />
					<Stat value={summary.active} label="active" />
					<Stat value={summary.totalViews} label="total views" />
				</div>
			</div>
			<div className="flex items-center rounded-md border border-border p-0.5">
				<ViewToggle active={view === "table"} onClick={() => onView("table")} label="Table">
					<Rows3 className="h-4 w-4" strokeWidth={1.7} />
				</ViewToggle>
				<ViewToggle active={view === "grid"} onClick={() => onView("grid")} label="Grid">
					<LayoutGrid className="h-4 w-4" strokeWidth={1.7} />
				</ViewToggle>
			</div>
		</div>
	);
}

function Stat({ value, label }: { value: number; label: string }) {
	return (
		<span className="inline-flex items-baseline gap-1">
			<span className="text-base font-semibold tabular-nums text-foreground">{value}</span>
			<span>{label}</span>
		</span>
	);
}

function ViewToggle({
	active,
	onClick,
	label,
	children,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			aria-label={label}
			className={cn(
				"flex h-7 w-8 items-center justify-center rounded transition-colors",
				active
					? "bg-muted text-foreground"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

// ── Shared bits ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: TSharedNoteStatus }) {
	const s = statusStyle(status);
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
				s.className,
			)}
		>
			<span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
			{s.label}
		</span>
	);
}

function NoteFlags({ row }: { row: TSharedNoteRow }) {
	return (
		<span className="inline-flex items-center gap-1.5 text-muted-foreground">
			{row.hasPassword && (
				<Flag icon={Lock} tip="Password protected" />
			)}
			{row.viewOnce && <Flag icon={Eye} tip="View once" />}
			{row.authorName && <Flag icon={User} tip={`Shared as ${row.authorName}`} />}
			{row.isStale && (
				<Flag icon={AlertTriangle} tip="Live note has changed since publishing" warn />
			)}
		</span>
	);
}

function Flag({
	icon: Icon,
	tip,
	warn,
}: {
	icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
	tip: string;
	warn?: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className={cn("inline-flex", warn && "text-warning")}>
					<Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
				</span>
			</TooltipTrigger>
			<TooltipContent>{tip}</TooltipContent>
		</Tooltip>
	);
}

type RowActionProps = {
	row: TSharedNoteRow;
	busy: boolean;
	copied: boolean;
	onCopy: (row: TSharedNoteRow) => void;
	onRefresh: (row: TSharedNoteRow) => void;
	onRevoke: (row: TSharedNoteRow) => void;
};

function RowActions({ row, busy, copied, onCopy, onRefresh, onRevoke }: RowActionProps) {
	const live = row.status === "active";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Share actions"
				>
					{busy ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<MoreHorizontal className="h-4 w-4" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuItem onClick={() => onCopy(row)} disabled={!live}>
					{copied ? (
						<Check className="h-3.5 w-3.5 text-success" />
					) : (
						<Copy className="h-3.5 w-3.5" />
					)}
					{copied ? "Copied" : "Copy link"}
				</DropdownMenuItem>
				<DropdownMenuItem asChild disabled={!live}>
					<a href={fullUrl(row)} target="_blank" rel="noreferrer">
						<ExternalLink className="h-3.5 w-3.5" />
						Open link
					</a>
				</DropdownMenuItem>
				{row.isStale && live && (
					<DropdownMenuItem onClick={() => onRefresh(row)}>
						<RefreshCw className="h-3.5 w-3.5" />
						Update snapshot
					</DropdownMenuItem>
				)}
				{live && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => onRevoke(row)}
							className="text-destructive focus:text-destructive"
						>
							<Ban className="h-3.5 w-3.5" />
							Revoke link
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// ── Table view ───────────────────────────────────────────────────────────────

function TableView({
	rows,
	windowDays,
	expandedId,
	onToggle,
	busyId,
	copiedId,
	onCopy,
	onRefresh,
	onRevoke,
}: {
	rows: TSharedNoteRow[];
	windowDays: number;
	expandedId: string | null;
	onToggle: (id: string) => void;
	busyId: string | null;
	copiedId: string | null;
	onCopy: (row: TSharedNoteRow) => void;
	onRefresh: (row: TSharedNoteRow) => void;
	onRevoke: (row: TSharedNoteRow) => void;
}) {
	return (
		<div className="mt-5 overflow-hidden rounded-lg border border-border">
			<div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-4 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				<span>Note</span>
				<span className="w-20 text-right">Views</span>
				<span className="w-24 text-right">Last viewed</span>
				<span className="w-32">Recurrence ({windowDays}d)</span>
				<span className="w-8" />
			</div>
			<ul className="divide-y divide-border">
				{rows.map((row) => {
					const expanded = expandedId === row.noteId;
					return (
						<li key={row.noteId}>
							<div
								className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
								onClick={() => onToggle(row.noteId)}
							>
								<div className="flex min-w-0 items-center gap-2">
									<StatusPill status={row.status} />
									<span className="truncate text-sm font-medium text-foreground">
										{row.name || "Untitled"}
									</span>
									<NoteFlags row={row} />
								</div>
								<div className="w-20 text-right">
									<div className="text-sm font-semibold tabular-nums">
										{row.totalViews}
									</div>
									{row.uniqueViewers > 0 && (
										<div className="text-[11px] text-muted-foreground">
											{row.uniqueViewers} unique
										</div>
									)}
								</div>
								<div className="w-24 text-right text-[13px] text-muted-foreground">
									{formatRelativeTime(row.lastViewedAt)}
								</div>
								<div className="w-32">
									<ViewSparkline data={row.timeline} />
								</div>
								<div className="w-8" onClick={(e) => e.stopPropagation()}>
									<RowActions
										row={row}
										busy={busyId === row.noteId}
										copied={copiedId === row.noteId}
										onCopy={onCopy}
										onRefresh={onRefresh}
										onRevoke={onRevoke}
									/>
								</div>
							</div>
							{expanded && <DetailPanel row={row} windowDays={windowDays} />}
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function DetailPanel({ row, windowDays }: { row: TSharedNoteRow; windowDays: number }) {
	return (
		<div className="border-t border-border bg-muted/20 px-4 py-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
					<Metric label="Created" value={formatDate(row.createdAt)} />
					<Metric label="Expires" value={formatExpiry(row.expiresAt)} />
					<Metric label="First viewed" value={formatRelativeTime(row.firstViewedAt)} />
					<Metric
						label="Activity span"
						value={formatSpan(row.firstViewedAt, row.lastViewedAt)}
					/>
					<Metric label={`Views (${windowDays}d)`} value={String(row.windowViews)} />
					<Metric label="Unique viewers" value={String(row.uniqueViewers)} />
					<Metric label="Active days" value={`${row.activeDays} / ${windowDays}`} />
					<Metric
						label="Busiest day"
						value={row.peak ? `${row.peak.date} (${row.peak.count})` : "—"}
					/>
					<Metric label="Author" value={row.authorName ?? "Anonymous"} />
				</dl>
				<div className="flex flex-col justify-between gap-3">
					<ViewSparkline data={row.timeline} height={48} />
					<code className="block truncate rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-muted-foreground">
						{fullUrl(row)}
					</code>
				</div>
			</div>
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
			<dd className="font-medium tabular-nums text-foreground">{value}</dd>
		</div>
	);
}

// ── Grid view ──────────────────────────────────────────────────────────────

function GridView({
	rows,
	windowDays,
	busyId,
	copiedId,
	onCopy,
	onRefresh,
	onRevoke,
}: {
	rows: TSharedNoteRow[];
	windowDays: number;
	busyId: string | null;
	copiedId: string | null;
	onCopy: (row: TSharedNoteRow) => void;
	onRefresh: (row: TSharedNoteRow) => void;
	onRevoke: (row: TSharedNoteRow) => void;
}) {
	return (
		<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{rows.map((row) => (
				<div
					key={row.noteId}
					className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4"
				>
					<div className="flex items-start justify-between gap-2">
						<div className="flex min-w-0 flex-col gap-1.5">
							<span className="truncate text-sm font-medium text-foreground">
								{row.name || "Untitled"}
							</span>
							<div className="flex items-center gap-2">
								<StatusPill status={row.status} />
								<NoteFlags row={row} />
							</div>
						</div>
						<RowActions
							row={row}
							busy={busyId === row.noteId}
							copied={copiedId === row.noteId}
							onCopy={onCopy}
							onRefresh={onRefresh}
							onRevoke={onRevoke}
						/>
					</div>

					<ViewSparkline data={row.timeline} height={40} />

					<div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
						<CardStat value={row.totalViews} label="views" />
						<CardStat value={row.uniqueViewers} label="unique" />
						<CardStat value={row.activeDays} label={`of ${windowDays}d`} />
					</div>
					<div className="text-[12px] text-muted-foreground">
						Last viewed {formatRelativeTime(row.lastViewedAt)}
					</div>
				</div>
			))}
		</div>
	);
}

function CardStat({ value, label }: { value: number; label: string }) {
	return (
		<div className="flex flex-col">
			<span className="text-base font-semibold tabular-nums text-foreground">{value}</span>
			<span className="text-[11px] text-muted-foreground">{label}</span>
		</div>
	);
}

// ── Revoke confirm ───────────────────────────────────────────────────────────

function RevokeDialog({
	target,
	onCancel,
	onConfirm,
}: {
	target: TSharedNoteRow | null;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog open={target !== null} onOpenChange={(o) => !o && onCancel()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Revoke share link</DialogTitle>
					<DialogDescription>
						The public link for{" "}
						<span className="font-medium text-foreground">
							{target?.name || "this note"}
						</span>{" "}
						will stop working immediately. View history is kept, but this can't be undone
						— you'd have to publish a new link.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline" size="sm">
							Cancel
						</Button>
					</DialogClose>
					<Button
						size="sm"
						onClick={onConfirm}
						className="border border-destructive/30 bg-destructive/15 text-destructive shadow-none hover:bg-destructive/25"
					>
						<Trash2 className="h-3.5 w-3.5" />
						Revoke link
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
