"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleAlert, LoaderCircle } from "lucide-react";
import type { AiUsageLogRow } from "@/domain/ai/types";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

type UsageFilter = "all" | "errors" | "success";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	dateStyle: "medium",
	timeStyle: "short",
});

const NUMBER_FORMATTER = new Intl.NumberFormat();

function formatDate(value: string | null) {
	if (!value) return "Never";
	return DATE_FORMATTER.format(new Date(value));
}

function FormattedDate({ value }: { value: string | null }) {
	return <span suppressHydrationWarning>{formatDate(value)}</span>;
}

function UsageStatusBadge({ status }: { status: string }) {
	const ok = status === "success";
	const warning = status === "rate_limited" || status === "untested";
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center border px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.12em]",
				ok && "border-success/25 bg-success/10 text-success",
				warning && "border-warning/25 bg-warning/10 text-warning",
				!ok && !warning && "border-destructive/25 bg-destructive/10 text-destructive",
			)}
		>
			{status.replace("_", " ")}
		</span>
	);
}

function UsageRow({ row }: { row: AiUsageLogRow }) {
	const [expanded, setExpanded] = useState(false);
	const hasDetails = Boolean(row.errorMessage || row.prompt || row.resourceUrl);
	const ok = row.status === "success";

	return (
		<div className="border-b border-border/60 last:border-b-0">
			<button
				type="button"
				disabled={!hasDetails}
				onClick={() => hasDetails && setExpanded((value) => !value)}
				className={cn(
					"flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
					hasDetails && "hover:bg-muted/40",
					!hasDetails && "cursor-default",
				)}
			>
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="truncate text-xs font-medium text-foreground">
							{row.humanAction ?? row.action}
						</span>
						<UsageStatusBadge status={row.status} />
					</div>
					<p className="text-[11px] text-muted-foreground">
						{row.provider} · {row.model ?? "Unknown model"} ·{" "}
						<FormattedDate value={row.createdAt} />
					</p>
					{row.errorMessage && !expanded ? (
						<p className="line-clamp-1 text-[11px] text-destructive/90">
							{row.errorMessage}
						</p>
					) : null}
				</div>
				{hasDetails ? (
					<ChevronDown
						className={cn(
							"mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
							expanded && "rotate-180",
						)}
					/>
				) : null}
			</button>

			{expanded && hasDetails ? (
				<div className="space-y-2 border-t border-border/40 bg-muted/20 px-3 py-2.5">
					{row.errorMessage ? (
						<p className="text-[11px] text-destructive">{row.errorMessage}</p>
					) : null}
					{row.resourceUrl ? (
						<a
							href={row.resourceUrl}
							className="inline-flex text-[11px] text-ring underline-offset-4 hover:underline"
						>
							{row.resourceUrl}
						</a>
					) : null}
					{row.prompt ? (
						<p className="line-clamp-3 text-[11px] text-muted-foreground/80">
							{row.prompt}
						</p>
					) : null}
					{ok && (row.inputTokens != null || row.outputTokens != null) ? (
						<div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
							<span>
								In{" "}
								{row.inputTokens != null
									? NUMBER_FORMATTER.format(row.inputTokens)
									: "—"}
							</span>
							<span>
								Out{" "}
								{row.outputTokens != null
									? NUMBER_FORMATTER.format(row.outputTokens)
									: "—"}
							</span>
							<span>
								Total{" "}
								{row.totalTokens != null
									? NUMBER_FORMATTER.format(row.totalTokens)
									: "—"}
							</span>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

const FILTER_OPTIONS: { id: UsageFilter; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "errors", label: "Errors" },
	{ id: "success", label: "Success" },
];

export function AiUsageLog({
	usage,
	usageState,
	usageError,
	nextOffset,
	onLoadMore,
}: {
	usage: AiUsageLogRow[];
	usageState: "idle" | "loading" | "error";
	usageError: string | null;
	nextOffset: number | null;
	onLoadMore: (offset: number) => void;
}) {
	const [filter, setFilter] = useState<UsageFilter>("all");
	const didUserChooseFilterRef = useRef(false);

	const stats = useMemo(() => {
		const errors = usage.filter((row) => row.status !== "success").length;
		return { total: usage.length, errors, success: usage.length - errors };
	}, [usage]);

	const effectiveFilter =
		!didUserChooseFilterRef.current && usage.length > 0 && stats.errors > 0 && filter === "all"
			? "errors"
			: filter;

	const filteredUsage = useMemo(() => {
		if (effectiveFilter === "errors") {
			return usage.filter((row) => row.status !== "success");
		}
		if (effectiveFilter === "success") {
			return usage.filter((row) => row.status === "success");
		}
		return usage;
	}, [effectiveFilter, usage]);

	return (
		<div className="rounded-lg border border-border/60 bg-card/40">
			<div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
				<div className="space-y-1">
					<h3 className="text-sm font-medium text-foreground">Activity log</h3>
					<p className="text-xs text-muted-foreground">
						Recent model calls, provider errors, and token usage.
					</p>
				</div>
				{usageState === "loading" && usage.length === 0 ? (
					<LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
				) : usage.length > 0 ? (
					<p className="text-[11px] text-muted-foreground">
						{stats.total} events
						{stats.errors > 0 ? (
							<span className="text-destructive"> · {stats.errors} errors</span>
						) : null}
					</p>
				) : null}
			</div>

			{usage.length > 0 ? (
				<div className="flex flex-wrap gap-1 border-y border-border/50 px-5 py-2">
					{FILTER_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() => {
								didUserChooseFilterRef.current = true;
								setFilter(option.id);
							}}
							className={cn(
								"border px-2.5 py-1 text-[11px] transition-colors",
								filter === option.id
									? "border-ring bg-accent text-accent-foreground"
									: "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							{option.label}
							{option.id === "errors" && stats.errors > 0
								? ` (${stats.errors})`
								: null}
						</button>
					))}
				</div>
			) : null}

			{usageError ? (
				<p className="flex items-center gap-2 px-5 py-3 text-xs text-destructive">
					<CircleAlert className="h-3.5 w-3.5 shrink-0" />
					{usageError}
				</p>
			) : null}

			{usage.length === 0 && usageState !== "loading" ? (
				<p className="px-5 py-4 text-xs text-muted-foreground/70 italic">
					No AI usage has been logged for this account yet.
				</p>
			) : null}

			{filteredUsage.length > 0 ? (
				<div className="max-h-72 overflow-y-auto">
					{filteredUsage.map((row) => (
						<UsageRow key={row.id} row={row} />
					))}
				</div>
			) : usage.length > 0 ? (
				<p className="px-5 py-4 text-xs text-muted-foreground/70 italic">
					No {filter === "errors" ? "errors" : "successful calls"} in the loaded history.
				</p>
			) : null}

			{nextOffset !== null ? (
				<div className="border-t border-border/50 px-5 py-3">
					<Button
						type="button"
						variant="outline"
						className="h-8 border-border bg-transparent text-xs"
						disabled={usageState === "loading"}
						onClick={() => onLoadMore(nextOffset)}
					>
						{usageState === "loading" ? (
							<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
						) : null}
						Load more
					</Button>
				</div>
			) : null}
		</div>
	);
}
