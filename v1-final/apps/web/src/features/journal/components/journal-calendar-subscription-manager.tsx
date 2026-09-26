"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pause, Pencil, Play, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { showUserToast } from "@/shared/lib/user-toast";
import { journalKeys } from "@/features/journal/hooks/journal-keys";
import { JournalCalendarSubscriptionWizard } from "./journal-calendar-subscription-wizard";
import {
	addLocalCalendarSubscription,
	listLocalCalendarSubscriptions,
	patchLocalCalendarSubscription,
	removeLocalCalendarSubscription,
	syncLocalCalendarSubscription,
	type LocalCalendarSubscription,
} from "@/features/journal/lib/local-calendar-subscriptions";

export type CalendarSubscription = {
	id: string;
	url: string;
	label: string;
	mode: "skip" | "update";
	enabled: boolean;
	lastSyncAt: string | null;
	lastSyncStatus: string | null;
	lastSyncError: string | null;
};

type Props = { onViewChange?: (view: "list" | "wizard") => void };

async function readError(response: Response): Promise<string> {
	const payload = (await response.json().catch(() => ({}))) as { error?: string };
	return payload.error || "Calendar subscription request failed.";
}

function describeSync(subscription: CalendarSubscription): string {
	const mode = subscription.mode === "update" ? "Updates existing" : "Skips duplicates";
	if (!subscription.lastSyncAt) return `${mode} · Not synced yet`;
	const when = new Date(subscription.lastSyncAt).toLocaleString();
	if (subscription.lastSyncStatus === "error") {
		return `${mode} · Failed ${when} — ${subscription.lastSyncError ?? "unknown error"}`;
	}
	return `${mode} · Synced ${when}`;
}

export function JournalCalendarSubscriptionManager({ onViewChange }: Props) {
	const backend = useWorkspaceBackend();
	const queryClient = useQueryClient();
	const isServer = backend.mode === "server";
	const [subscriptions, setSubscriptions] = useState<CalendarSubscription[]>([]);
	const [view, setViewState] = useState<"list" | "wizard">("list");
	const [busy, setBusy] = useState(false);
	const [syncingId, setSyncingId] = useState<string>();
	const [error, setError] = useState<string>();
	const [editingId, setEditingId] = useState<string>();
	const [editLabel, setEditLabel] = useState("");
	const [editMode, setEditMode] = useState<"skip" | "update">("skip");
	const [savingEdit, setSavingEdit] = useState(false);

	function setView(next: "list" | "wizard") {
		setViewState(next);
		onViewChange?.(next);
	}

	async function load() {
		if (!isServer) {
			setSubscriptions(listLocalCalendarSubscriptions());
			return;
		}
		setBusy(true);
		setError(undefined);
		try {
			const response = await fetch("/api/calendar/subscriptions", { cache: "no-store" });
			if (!response.ok) throw new Error(await readError(response));
			const payload = (await response.json()) as { subscriptions: CalendarSubscription[] };
			setSubscriptions(payload.subscriptions);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not load subscriptions.");
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		void load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isServer]);

	async function addSubscription(input: { url: string; label: string; mode: "skip" | "update" }) {
		if (isServer) {
			const response = await fetch("/api/calendar/subscriptions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (!response.ok) throw new Error(await readError(response));
			const payload = (await response.json()) as { subscription: CalendarSubscription };
			setSubscriptions((current) => [payload.subscription, ...current]);
		} else {
			const subscription = addLocalCalendarSubscription(input);
			setSubscriptions((current) => [subscription, ...current]);
		}
		setView("list");
		showUserToast("Calendar subscription added. It syncs about once a day.", "success");
	}

	async function toggleSubscription(subscription: CalendarSubscription) {
		const enabled = !subscription.enabled;
		try {
			if (isServer) {
				const response = await fetch(`/api/calendar/subscriptions/${subscription.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ enabled }),
				});
				if (!response.ok) throw new Error(await readError(response));
			} else {
				patchLocalCalendarSubscription(subscription.id, { enabled });
			}
			setSubscriptions((current) =>
				current.map((entry) =>
					entry.id === subscription.id ? { ...entry, enabled } : entry,
				),
			);
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not update the subscription.",
			);
		}
	}

	async function deleteSubscription(id: string) {
		try {
			if (isServer) {
				const response = await fetch(`/api/calendar/subscriptions/${id}`, {
					method: "DELETE",
				});
				if (!response.ok) throw new Error(await readError(response));
			} else {
				removeLocalCalendarSubscription(id);
			}
			setSubscriptions((current) => current.filter((entry) => entry.id !== id));
			showUserToast("Calendar subscription removed.", "success");
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not remove the subscription.",
			);
		}
	}

	function startEdit(subscription: CalendarSubscription) {
		setEditingId(subscription.id);
		setEditLabel(subscription.label);
		setEditMode(subscription.mode);
		setError(undefined);
	}

	async function saveEdit(id: string) {
		const label = editLabel.trim();
		if (!label) {
			setError("The label cannot be empty.");
			return;
		}
		setSavingEdit(true);
		setError(undefined);
		try {
			if (isServer) {
				const response = await fetch(`/api/calendar/subscriptions/${id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ label, mode: editMode }),
				});
				if (!response.ok) throw new Error(await readError(response));
			} else {
				patchLocalCalendarSubscription(id, { label, mode: editMode });
			}
			setSubscriptions((current) =>
				current.map((entry) =>
					entry.id === id ? { ...entry, label, mode: editMode } : entry,
				),
			);
			setEditingId(undefined);
			showUserToast("Calendar subscription updated.", "success");
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not update the subscription.",
			);
		} finally {
			setSavingEdit(false);
		}
	}

	async function syncNow(subscription: CalendarSubscription) {
		setSyncingId(subscription.id);
		setError(undefined);
		try {
			if (isServer) {
				const response = await fetch(
					`/api/calendar/subscriptions/${subscription.id}/sync`,
					{ method: "POST" },
				);
				const payload = (await response.json().catch(() => ({}))) as {
					outcome?: { created: number; updated: number; error: string | null };
					error?: string;
				};
				if (!payload.outcome) throw new Error(payload.error || "Sync failed.");
				if (payload.outcome.error) throw new Error(payload.outcome.error);
				showUserToast(
					`Synced: ${payload.outcome.created} new, ${payload.outcome.updated} updated.`,
					"success",
				);
			} else {
				const outcome = await syncLocalCalendarSubscription(
					backend,
					subscription as LocalCalendarSubscription,
				);
				if (outcome.error) throw new Error(outcome.error);
				showUserToast(
					`Synced: ${outcome.created} new, ${outcome.updated} updated.`,
					"success",
				);
			}
			await queryClient.invalidateQueries({ queryKey: journalKeys.all });
			await load();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Sync failed.");
			await load();
		} finally {
			setSyncingId(undefined);
		}
	}

	if (view === "wizard") {
		return (
			<JournalCalendarSubscriptionWizard
				onComplete={addSubscription}
				onCancel={() => setView("list")}
			/>
		);
	}

	return (
		<div className="space-y-3">
			{error && (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			)}

			<div className="space-y-2">
				{subscriptions.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						{busy
							? "Loading…"
							: "No calendar subscriptions yet. Add one to bring Google or iCloud events into your journal automatically."}
					</p>
				) : (
					subscriptions.map((subscription) => (
						<div
							key={subscription.id}
							className="rounded-md border border-border p-2.5"
						>
							<div className="flex items-center gap-2">
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs font-medium">
										{subscription.label}
										{!subscription.enabled && (
											<span className="ml-1.5 text-muted-foreground">
												(paused)
											</span>
										)}
									</p>
									<p className="truncate text-[10px] text-muted-foreground">
										{describeSync(subscription)}
									</p>
								</div>
								<button
									type="button"
									aria-label="Sync now"
									disabled={syncingId === subscription.id}
									onClick={() => void syncNow(subscription)}
									className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
								>
									{syncingId === subscription.id ? (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									) : (
										<RefreshCw className="h-3.5 w-3.5" />
									)}
								</button>
								<button
									type="button"
									aria-label={
										editingId === subscription.id
											? "Cancel editing"
											: "Edit subscription"
									}
									onClick={() =>
										editingId === subscription.id
											? setEditingId(undefined)
											: startEdit(subscription)
									}
									className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
								>
									{editingId === subscription.id ? (
										<X className="h-3.5 w-3.5" />
									) : (
										<Pencil className="h-3.5 w-3.5" />
									)}
								</button>
								<button
									type="button"
									aria-label={
										subscription.enabled
											? "Pause subscription"
											: "Resume subscription"
									}
									onClick={() => void toggleSubscription(subscription)}
									className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
								>
									{subscription.enabled ? (
										<Pause className="h-3.5 w-3.5" />
									) : (
										<Play className="h-3.5 w-3.5" />
									)}
								</button>
								<button
									type="button"
									aria-label="Delete subscription"
									onClick={() => void deleteSubscription(subscription.id)}
									className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
							</div>

							{editingId === subscription.id && (
								<div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
									<label className="block space-y-1">
										<span className="text-[10px] font-medium text-muted-foreground">
											Label
										</span>
										<input
											type="text"
											value={editLabel}
											maxLength={80}
											onChange={(event) => setEditLabel(event.target.value)}
											className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs"
										/>
									</label>
									<div
										role="radiogroup"
										aria-label="Import mode"
										className="flex gap-1.5"
									>
										{(
											[
												["skip", "Skip duplicates"],
												["update", "Update existing"],
											] as const
										).map(([mode, name]) => (
											<button
												key={mode}
												type="button"
												role="radio"
												aria-checked={editMode === mode}
												onClick={() => setEditMode(mode)}
												className={
													editMode === mode
														? "rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background"
														: "rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
												}
											>
												{name}
											</button>
										))}
									</div>
									<p className="break-all font-mono text-[10px] text-muted-foreground">
										{subscription.url}
									</p>
									<button
										type="button"
										disabled={savingEdit}
										onClick={() => void saveEdit(subscription.id)}
										className="inline-flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[11px] font-medium text-background disabled:opacity-50"
									>
										{savingEdit ? (
											<Loader2 className="h-3 w-3 animate-spin" />
										) : (
											<Check className="h-3 w-3" />
										)}
										Save
									</button>
								</div>
							)}
						</div>
					))
				)}
			</div>

			<div className="flex justify-end">
				<button
					type="button"
					onClick={() => setView("wizard")}
					className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background"
				>
					<Plus className="h-3.5 w-3.5" />
					Add calendar
				</button>
			</div>
		</div>
	);
}
