"use client";

import { useEffect, useState } from "react";
import { Loader2, Pause, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
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

type Subscription = {
	id: string;
	url: string;
	label: string;
	mode: "skip" | "update";
	enabled: boolean;
	lastSyncAt: string | null;
	lastSyncStatus: string | null;
	lastSyncError: string | null;
};

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

async function readError(response: Response): Promise<string> {
	const payload = (await response.json().catch(() => ({}))) as { error?: string };
	return payload.error || "Calendar subscription request failed.";
}

function describeSync(subscription: Subscription): string {
	if (!subscription.lastSyncAt) return "Not synced yet";
	const when = new Date(subscription.lastSyncAt).toLocaleString();
	if (subscription.lastSyncStatus === "error") {
		return `Failed ${when} — ${subscription.lastSyncError ?? "unknown error"}`;
	}
	return `Synced ${when}`;
}

export function JournalCalendarSubscriptionsDialog({ open, onOpenChange }: Props) {
	const backend = useWorkspaceBackend();
	const queryClient = useQueryClient();
	const isServer = backend.mode === "server";
	const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
	const [view, setView] = useState<"list" | "wizard">("list");
	const [busy, setBusy] = useState(false);
	const [syncingId, setSyncingId] = useState<string>();
	const [error, setError] = useState<string>();

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
			const payload = (await response.json()) as { subscriptions: Subscription[] };
			setSubscriptions(payload.subscriptions);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not load subscriptions.");
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		if (open) void load();
		if (!open) {
			setView("list");
			setError(undefined);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, isServer]);

	async function addSubscription(input: { url: string; label: string; mode: "skip" | "update" }) {
		if (isServer) {
			const response = await fetch("/api/calendar/subscriptions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (!response.ok) throw new Error(await readError(response));
			const payload = (await response.json()) as { subscription: Subscription };
			setSubscriptions((current) => [payload.subscription, ...current]);
		} else {
			const subscription = addLocalCalendarSubscription(input);
			setSubscriptions((current) => [subscription, ...current]);
		}
		setView("list");
		showUserToast("Calendar subscription added. It syncs about once a day.", "success");
	}

	async function toggleSubscription(subscription: Subscription) {
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

	async function syncNow(subscription: Subscription) {
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{view === "wizard" ? "Add a calendar" : "External calendar subscriptions"}
					</DialogTitle>
					<DialogDescription>
						{view === "wizard"
							? "A short guided setup — Skriuw walks you through getting the link and testing it."
							: "Connected calendars are imported into your journal about once a day."}
					</DialogDescription>
				</DialogHeader>

				{view === "wizard" ? (
					<JournalCalendarSubscriptionWizard
						onComplete={addSubscription}
						onCancel={() => setView("list")}
					/>
				) : (
					<>
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
										className="flex items-center gap-2 rounded-md border border-border p-2.5"
									>
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
								))
							)}
						</div>

						<DialogFooter>
							<button
								type="button"
								onClick={() => setView("wizard")}
								className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background"
							>
								<Plus className="h-3.5 w-3.5" />
								Add calendar
							</button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
