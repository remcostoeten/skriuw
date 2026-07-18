"use client";

import { useEffect, useState } from "react";
import { Loader2, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
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
	const [url, setUrl] = useState("");
	const [label, setLabel] = useState("");
	const [mode, setMode] = useState<"skip" | "update">("skip");
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
			setUrl("");
			setLabel("");
			setMode("skip");
			setError(undefined);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, isServer]);

	async function addSubscription() {
		setBusy(true);
		setError(undefined);
		try {
			if (isServer) {
				const response = await fetch("/api/calendar/subscriptions", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ url, label, mode }),
				});
				if (!response.ok) throw new Error(await readError(response));
				const payload = (await response.json()) as { subscription: Subscription };
				setSubscriptions((current) => [payload.subscription, ...current]);
			} else {
				const subscription = addLocalCalendarSubscription({ url, label, mode });
				setSubscriptions((current) => [subscription, ...current]);
			}
			setUrl("");
			setLabel("");
			showUserToast("Calendar subscription added. It syncs about once a day.", "success");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not add that calendar.");
		} finally {
			setBusy(false);
		}
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
					<DialogTitle>External calendar subscriptions</DialogTitle>
					<DialogDescription>
						Paste an ICS URL — Google Calendar&apos;s &quot;Secret address in iCal
						format&quot; or an iCloud share link. Skriuw imports its events into your
						journal about once a day.
					</DialogDescription>
				</DialogHeader>

				{error && (
					<p role="alert" className="text-xs text-destructive">
						{error}
					</p>
				)}

				<div className="space-y-2">
					<input
						type="url"
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
						aria-label="Calendar URL"
						className="h-8 w-full rounded-md border border-border bg-transparent px-2.5 text-xs"
					/>
					<div className="flex gap-2">
						<input
							type="text"
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							placeholder="Label (optional)"
							aria-label="Subscription label"
							className="h-8 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2.5 text-xs"
						/>
						<select
							value={mode}
							onChange={(event) =>
								setMode(event.target.value === "update" ? "update" : "skip")
							}
							aria-label="Import mode"
							className="h-8 rounded-md border border-border bg-transparent px-2 text-xs"
						>
							<option value="skip">Never overwrite my entries</option>
							<option value="update">Update matching entries</option>
						</select>
					</div>
				</div>

				<div className="space-y-2">
					{subscriptions.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							{busy ? "Loading…" : "No calendar subscriptions yet."}
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
						disabled={busy || !url.trim()}
						onClick={() => void addSubscription()}
						className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50"
					>
						{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
						Add subscription
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
