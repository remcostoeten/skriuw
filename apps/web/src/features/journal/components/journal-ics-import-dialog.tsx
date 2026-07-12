"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CalendarArrowUp, FileUp, Loader2 } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";
import type { JournalEntry } from "@/domain/journal/models";
import {
	parseJournalIcs,
	planJournalIcsImport,
	summarizeJournalImport,
	validateIcsFile,
	type JournalImportMode,
	type JournalImportPlan,
	type JournalImportSummary,
	type ParsedIcsEvent,
} from "@/domain/journal/ics-import";
import {
	useCreateJournalEntry,
	useUpdateJournalEntry,
} from "@/features/journal/hooks/use-journal-entries";
import { showUserToast } from "@/shared/lib/user-toast";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	entries: JournalEntry[];
};

type FailedItem = {
	event: ParsedIcsEvent;
	targetId?: string;
	message: string;
};

type Phase =
	| { step: "pick"; error?: string; busy?: boolean }
	| { step: "preview"; fileName: string; plan: JournalImportPlan }
	| { step: "importing"; done: number; total: number }
	| { step: "done"; summary: JournalImportSummary; failures: FailedItem[] };

const PREVIEW_ROW_LIMIT = 5;

function previewSnippet(event: ParsedIcsEvent): string {
	const title = event.title?.trim();
	if (title) return title;
	return event.content.trim().slice(0, 60) || "Empty entry";
}

export function JournalIcsImportDialog({ open, onOpenChange, entries }: Props) {
	const [phase, setPhase] = useState<Phase>({ step: "pick" });
	const [mode, setMode] = useState<JournalImportMode>("skip");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const createEntry = useCreateJournalEntry();
	const updateEntry = useUpdateJournalEntry();

	function reset() {
		setPhase({ step: "pick" });
		setMode("skip");
	}

	function handleOpenChange(next: boolean) {
		if (!next && phase.step === "importing") return;
		if (!next) reset();
		onOpenChange(next);
	}

	async function handleFile(file: File) {
		const validationError = validateIcsFile(file);
		if (validationError) {
			setPhase({ step: "pick", error: validationError });
			return;
		}
		setPhase({ step: "pick", busy: true });
		try {
			const text = await file.text();
			const parsed = parseJournalIcs(text);
			const plan = planJournalIcsImport(parsed, entries, mode);
			setPhase({ step: "preview", fileName: file.name, plan });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Could not read this calendar file.";
			setPhase({ step: "pick", error: message });
		}
	}

	function replan(nextMode: JournalImportMode) {
		setMode(nextMode);
		if (phase.step !== "preview") return;
		const parsedShape = {
			calendarName: undefined,
			totalEvents: 0,
			events: [
				...phase.plan.creates,
				...phase.plan.updates.map((update) => update.event),
				...phase.plan.duplicates,
			],
			skipped: [],
		};
		setPhase({
			...phase,
			plan: {
				...planJournalIcsImport(parsedShape, entries, nextMode),
				skipped: phase.plan.skipped,
			},
		});
	}

	async function runImport(
		creates: ParsedIcsEvent[],
		updates: { targetId: string; event: ParsedIcsEvent }[],
		priorSummary?: JournalImportSummary,
	) {
		const total = creates.length + updates.length;
		let done = 0;
		let created = 0;
		let updated = 0;
		const failures: FailedItem[] = [];
		setPhase({ step: "importing", done, total });

		for (const event of creates) {
			try {
				await createEntry.mutateAsync({
					dateKey: event.dateKey,
					title: event.title ?? null,
					content: event.content,
					tags: event.tags,
					mood: event.mood,
				});
				created++;
			} catch (error) {
				failures.push({
					event,
					message: error instanceof Error ? error.message : "Could not create entry",
				});
			}
			done++;
			setPhase({ step: "importing", done, total });
		}

		for (const update of updates) {
			try {
				const result = await updateEntry.mutateAsync({
					id: update.targetId,
					title: update.event.title ?? null,
					content: update.event.content,
					richContent: null,
					tags: update.event.tags,
					mood: update.event.mood ?? null,
				});
				if (result) {
					updated++;
				} else {
					failures.push({
						event: update.event,
						targetId: update.targetId,
						message: "Entry no longer exists",
					});
				}
			} catch (error) {
				failures.push({
					event: update.event,
					targetId: update.targetId,
					message: error instanceof Error ? error.message : "Could not update entry",
				});
			}
			done++;
			setPhase({ step: "importing", done, total });
		}

		const summary: JournalImportSummary = {
			created: (priorSummary?.created ?? 0) + created,
			updated: (priorSummary?.updated ?? 0) + updated,
			skippedDuplicates: priorSummary?.skippedDuplicates ?? 0,
			skippedInvalid: priorSummary?.skippedInvalid ?? 0,
			failed: failures.length,
		};
		setPhase({ step: "done", summary, failures });
		showUserToast(summarizeJournalImport(summary), failures.length > 0 ? "error" : "success");
	}

	async function handleConfirm() {
		if (phase.step !== "preview") return;
		// Re-plan against the live entries list right before writing, so an entry
		// created since the preview turns into a skip instead of an overwrite.
		const events = [
			...phase.plan.creates,
			...phase.plan.updates.map((update) => update.event),
			...phase.plan.duplicates,
		];
		const plan = planJournalIcsImport(
			{ calendarName: undefined, totalEvents: events.length, events, skipped: [] },
			entries,
			mode,
		);
		await runImport(plan.creates, plan.updates, {
			created: 0,
			updated: 0,
			skippedDuplicates: plan.duplicates.length,
			skippedInvalid: phase.plan.skipped.length,
			failed: 0,
		});
	}

	async function handleRetryFailed() {
		if (phase.step !== "done") return;
		const creates = phase.failures.filter((item) => !item.targetId).map((item) => item.event);
		const updates = phase.failures
			.filter((item): item is FailedItem & { targetId: string } => Boolean(item.targetId))
			.map((item) => ({ targetId: item.targetId, event: item.event }));
		await runImport(creates, updates, { ...phase.summary, failed: 0 });
	}

	const plan = phase.step === "preview" ? phase.plan : null;
	const importCount = plan ? plan.creates.length + plan.updates.length : 0;
	const previewRows = plan
		? [...plan.creates, ...plan.updates.map((update) => update.event)].slice(
				0,
				PREVIEW_ROW_LIMIT,
			)
		: [];
	const warnings = plan
		? [
				...new Set(
					[
						...plan.creates,
						...plan.updates.map((u) => u.event),
						...plan.duplicates,
					].flatMap((event) => event.warnings),
				),
			]
		: [];

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Import calendar into journal</DialogTitle>
					<DialogDescription>
						Reads an .ics file and turns each event into a journal entry on its date.
						Nothing is written until you confirm — days that already have an entry are
						skipped by default.
					</DialogDescription>
				</DialogHeader>

				{phase.step === "pick" && (
					<div className="flex flex-col gap-3">
						<input
							ref={fileInputRef}
							type="file"
							accept=".ics,text/calendar"
							className="sr-only"
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = "";
								if (file) void handleFile(file);
							}}
						/>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={phase.busy}
							className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-ring hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							{phase.busy ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
									Reading file…
								</>
							) : (
								<>
									<FileUp className="h-4 w-4" aria-hidden="true" />
									Choose an .ics file (max 5 MB)
								</>
							)}
						</button>
						{phase.error && (
							<p
								role="alert"
								className="flex items-start gap-1.5 text-xs text-destructive"
							>
								<AlertTriangle
									className="mt-0.5 h-3 w-3 shrink-0"
									aria-hidden="true"
								/>
								{phase.error}
							</p>
						)}
					</div>
				)}

				{phase.step === "preview" && plan && (
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							<span className="font-medium text-foreground">{phase.fileName}</span> —{" "}
							{plan.creates.length + plan.updates.length + plan.duplicates.length}{" "}
							usable{" "}
							{plan.creates.length + plan.updates.length + plan.duplicates.length ===
							1
								? "event"
								: "events"}
							, {plan.creates.length} new,{" "}
							{mode === "update"
								? `${plan.updates.length} to update`
								: `${plan.duplicates.length} duplicates skipped`}
							{plan.skipped.length > 0 ? `, ${plan.skipped.length} unsupported` : ""}.
						</p>

						<div className="flex items-center gap-1.5">
							{(
								[
									{ id: "skip", label: "Skip duplicates" },
									{ id: "update", label: "Update existing" },
								] as const
							).map((option) => (
								<button
									key={option.id}
									type="button"
									onClick={() => replan(option.id)}
									aria-pressed={mode === option.id}
									className={cn(
										"h-7 rounded-md border px-2.5 text-xs font-medium transition-colors",
										mode === option.id
											? "border-ring bg-muted text-foreground"
											: "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
									)}
								>
									{option.label}
								</button>
							))}
						</div>
						{mode === "update" && plan.updates.length > 0 && (
							<p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
								<AlertTriangle
									className="mt-0.5 h-3 w-3 shrink-0"
									aria-hidden="true"
								/>
								Updating replaces the title, text, tags, and mood of{" "}
								{plan.updates.length} existing{" "}
								{plan.updates.length === 1 ? "entry" : "entries"}.
							</p>
						)}

						{previewRows.length > 0 && (
							<ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2">
								{previewRows.map((event) => (
									<li
										key={`${event.dateKey}-${event.uid ?? event.title ?? ""}`}
										className="flex items-baseline gap-2 text-xs"
									>
										<span className="shrink-0 font-medium text-muted-foreground">
											{event.dateKey}
										</span>
										<span className="truncate text-foreground/80">
											{previewSnippet(event)}
										</span>
									</li>
								))}
								{importCount > PREVIEW_ROW_LIMIT && (
									<li className="text-xs text-muted-foreground">
										…and {importCount - PREVIEW_ROW_LIMIT} more
									</li>
								)}
							</ul>
						)}

						{plan.skipped.length > 0 && (
							<div className="max-h-24 overflow-y-auto rounded-md border border-border p-2">
								<p className="mb-1 text-[11px] font-medium text-muted-foreground">
									Skipped events
								</p>
								<ul className="space-y-0.5">
									{plan.skipped.map((item, index) => (
										<li
											key={index}
											className="truncate text-xs text-muted-foreground"
										>
											{item.summary ? `"${item.summary}" — ` : ""}
											{item.reason}
										</li>
									))}
								</ul>
							</div>
						)}

						{warnings.length > 0 && (
							<ul className="space-y-0.5">
								{warnings.map((warning) => (
									<li
										key={warning}
										className="flex items-start gap-1.5 text-xs text-muted-foreground"
									>
										<AlertTriangle
											className="mt-0.5 h-3 w-3 shrink-0"
											aria-hidden="true"
										/>
										{warning}
									</li>
								))}
							</ul>
						)}
					</div>
				)}

				{phase.step === "importing" && (
					<div
						role="status"
						aria-live="polite"
						className="flex items-center gap-2 text-xs text-muted-foreground"
					>
						<Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
						Importing {phase.done} of {phase.total}…
					</div>
				)}

				{phase.step === "done" && (
					<div className="flex flex-col gap-2">
						<p role="status" className="text-xs text-foreground/80">
							{summarizeJournalImport(phase.summary)}
						</p>
						{phase.failures.length > 0 && (
							<ul className="max-h-24 space-y-0.5 overflow-y-auto rounded-md border border-border p-2">
								{phase.failures.map((failure, index) => (
									<li key={index} className="truncate text-xs text-destructive">
										{failure.event.dateKey} — {failure.message}
									</li>
								))}
							</ul>
						)}
					</div>
				)}

				<DialogFooter>
					{phase.step === "preview" && (
						<>
							<button
								type="button"
								onClick={reset}
								className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							>
								Choose another file
							</button>
							<button
								type="button"
								onClick={() => void handleConfirm()}
								disabled={importCount === 0}
								className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<CalendarArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
								Import {importCount} {importCount === 1 ? "entry" : "entries"}
							</button>
						</>
					)}
					{phase.step === "done" && (
						<>
							{phase.failures.length > 0 && (
								<button
									type="button"
									onClick={() => void handleRetryFailed()}
									className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								>
									Retry failed
								</button>
							)}
							<button
								type="button"
								onClick={() => handleOpenChange(false)}
								className="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
							>
								Done
							</button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
