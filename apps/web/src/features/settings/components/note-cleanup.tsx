"use client";

import { useLayoutEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { MorphingLabel } from "@/shared/ui/morphing-label";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { Row } from "@/features/settings/components/settings-primitives";
import { showUserToast } from "@/shared/lib/user-toast";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { useNotesCacheScope } from "@/features/notes/hooks/use-notes-cache-scope";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import type { NoteCleanupScanPhase } from "@/features/settings/lib/use-note-cleanup-scan";
import type { CleanupReason, CleanupScanResult } from "@/domain/notes/cleanup";
import type { NoteFile } from "@/domain/notes/models";

type RemovePhase = "review" | "removing" | "done" | "error";

const REASON_LABELS: Record<CleanupReason, string> = {
	empty: "Empty notes",
	default: "Untouched starter notes",
	duplicate: "Duplicates",
};

const REASON_ORDER: CleanupReason[] = ["empty", "default", "duplicate"];

function Spinner() {
	return (
		<span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current" />
	);
}

function CheckIcon({ size = 10 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
			<path
				d="M5 13l4 4L19 7"
				stroke="currentColor"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CandidateCheckbox({ checked }: { checked: boolean }) {
	return (
		<span
			aria-hidden
			className={cn(
				"flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
				checked
					? "border-primary bg-primary text-primary-foreground"
					: "border-input bg-background",
			)}
		>
			{checked && <CheckIcon />}
		</span>
	);
}

export function NoteCleanupScanButton({
	phase,
	onScan,
	disabled,
}: {
	phase: NoteCleanupScanPhase;
	onScan: () => void;
	disabled?: boolean;
}) {
	const frames = [
		{ key: "idle", label: "Scan", icon: <Sparkles className="size-3.5 shrink-0" /> },
		{ key: "scanning", label: "Scanning…", icon: <Spinner /> },
		{ key: "scanned", label: "Scanned", icon: <CheckIcon size={14} /> },
		{ key: "error", label: "Retry scan", icon: <RotateCcw className="size-3.5 shrink-0" /> },
	];

	return (
		<button
			onClick={onScan}
			disabled={disabled || phase === "scanning"}
			className={cn(
				"relative inline-flex h-8 items-center justify-center overflow-hidden rounded-md border text-sm font-medium transition-all duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/70",
				phase === "scanning" && "cursor-default",
				disabled && "cursor-not-allowed opacity-50",
				!disabled &&
					phase === "error" &&
					"border-destructive/60 bg-destructive/15 text-destructive-foreground",
				!disabled &&
					phase !== "error" &&
					"border-input bg-secondary text-secondary-foreground hover:bg-accent",
			)}
		>
			<MorphingLabel
				activeKey={phase}
				framePadding="px-3"
				frames={frames.map((frame) => ({
					key: frame.key,
					content: (
						<>
							{frame.icon}
							{frame.label}
						</>
					),
				}))}
			/>
		</button>
	);
}

export function NoteCleanupRow({
	phase,
	onScan,
	disabled,
}: {
	phase: NoteCleanupScanPhase;
	onScan: () => void;
	disabled?: boolean;
}) {
	return (
		<Row
			focusId="note-cleanup"
			title="Clean up notes"
			description="Find empty notes, untouched starter notes, and duplicates, review the list, and move them to the trash."
		>
			<NoteCleanupScanButton phase={phase} onScan={onScan} disabled={disabled} />
		</Row>
	);
}

export function NoteCleanupDialog({
	result,
	onOpenChange,
}: {
	result: CleanupScanResult | null;
	onOpenChange: (open: boolean) => void;
}) {
	const backend = useWorkspaceBackend();
	const queryClient = useQueryClient();
	const scope = useNotesCacheScope();

	const candidates = result?.candidates ?? [];
	const [phase, setPhase] = useState<RemovePhase>("review");
	const [error, setError] = useState<string | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [removedCount, setRemovedCount] = useState(0);

	// This component is mounted once for the lifetime of its settings section —
	// only Radix's internal presence toggles on `result`, so plain useState
	// initializers only ever run against the very first (null) result. Re-sync
	// explicitly whenever a fresh scan hands back a new result, or every scan
	// after the first would reuse whatever was left over from the last one
	// (stale selection, and a dialog stuck showing "done" forever).
	useLayoutEffect(() => {
		if (!result) return;
		setSelectedIds(new Set(result.candidates.map((candidate) => candidate.note.id)));
		setPhase("review");
		setError(null);
		setRemovedCount(0);
	}, [result]);

	function toggleCandidate(id: string) {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	async function handleRemove() {
		const ids = candidates
			.map((candidate) => candidate.note.id)
			.filter((id) => selectedIds.has(id));
		if (ids.length === 0) return;

		setPhase("removing");
		setError(null);
		try {
			if (backend.deleteNotes) {
				await backend.deleteNotes(ids);
			} else {
				for (const id of ids) {
					await backend.deleteNote(id);
				}
			}
			const removed = new Set(ids);
			const filesKey = notesKeys.files(scope);
			queryClient.setQueryData<NoteFile[]>(filesKey, (current) =>
				(current ?? []).filter((note) => !removed.has(note.id)),
			);
			for (const id of ids) {
				queryClient.removeQueries({ queryKey: notesKeys.detail(id) });
			}
			void queryClient.invalidateQueries({ queryKey: notesKeys.all });
			setRemovedCount(ids.length);
			setPhase("done");
			showUserToast(
				`Moved ${ids.length} ${ids.length === 1 ? "note" : "notes"} to trash`,
				"success",
			);
		} catch (removeError) {
			setError(removeError instanceof Error ? removeError.message : "Cleanup failed.");
			setPhase("error");
		}
	}

	const selectedCount = candidates.filter((candidate) =>
		selectedIds.has(candidate.note.id),
	).length;
	const allSelected = candidates.length > 0 && selectedCount === candidates.length;

	function toggleSelectAll() {
		setSelectedIds(
			allSelected ? new Set() : new Set(candidates.map((candidate) => candidate.note.id)),
		);
	}

	return (
		<Dialog open={result !== null} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Clean up notes</DialogTitle>
					<DialogDescription>
						Review what the scan found before anything moves. Removed notes go to the
						trash and can be restored from there.
					</DialogDescription>
				</DialogHeader>

				{phase !== "done" && candidates.length > 0 && (
					<div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-xs">
						<span className="text-muted-foreground">
							{selectedCount} of {candidates.length} selected
						</span>
						<button
							type="button"
							onClick={toggleSelectAll}
							disabled={phase === "removing"}
							className="font-medium text-foreground underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-50"
						>
							{allSelected ? "Deselect all" : "Select all"}
						</button>
					</div>
				)}

				{phase !== "done" && candidates.length > 0 && (
					<div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
						{REASON_ORDER.map((reason) => {
							const group = candidates.filter(
								(candidate) => candidate.reason === reason,
							);
							if (group.length === 0) return null;
							return (
								<div key={reason} className="space-y-2">
									<p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
										{REASON_LABELS[reason]} · {group.length}
									</p>
									{group.map((candidate) => {
										const checked = selectedIds.has(candidate.note.id);
										return (
											<label
												key={candidate.note.id}
												className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 p-2.5 text-xs"
											>
												<input
													type="checkbox"
													checked={checked}
													onChange={() =>
														toggleCandidate(candidate.note.id)
													}
													disabled={phase === "removing"}
													className="sr-only"
												/>
												<span className="flex min-w-0 flex-1 items-center gap-2.5">
													<CandidateCheckbox checked={checked} />
													<span className="min-w-0">
														<span className="block truncate font-medium text-foreground">
															{candidate.note.name}
														</span>
														{candidate.duplicateOfName && (
															<span className="block truncate text-muted-foreground">
																Same content as{" "}
																{candidate.duplicateOfName}
															</span>
														)}
														<span className="mt-0.5 line-clamp-2 text-muted-foreground">
															{candidate.preview}
														</span>
													</span>
												</span>
											</label>
										);
									})}
								</div>
							);
						})}
					</div>
				)}

				{phase === "done" && (
					<p className="text-sm text-foreground">
						Moved {removedCount} {removedCount === 1 ? "note" : "notes"} to the trash.
					</p>
				)}

				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}

				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline" size="sm" disabled={phase === "removing"}>
							{phase === "done" ? "Close" : "Cancel"}
						</Button>
					</DialogClose>
					{phase !== "done" && candidates.length > 0 && (
						<Button
							size="sm"
							variant="destructive"
							disabled={phase === "removing" || selectedCount === 0}
							onClick={handleRemove}
						>
							{phase === "removing" ? "Moving…" : `Move ${selectedCount} to trash`}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
