"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Check, Copy, Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { showUserToast } from "@/shared/lib/user-toast";

type FeedToken = {
	id: string;
	name: string;
	tokenPrefix: string;
	revokedAt: string | null;
	lastUsedAt: string | null;
	createdAt: string;
};

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

async function readError(response: Response): Promise<string> {
	const payload = (await response.json().catch(() => ({}))) as { error?: string };
	return payload.error || "Calendar link request failed.";
}

export function JournalCalendarFeedDialog({ open, onOpenChange }: Props) {
	const [tokens, setTokens] = useState<FeedToken[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [revealedToken, setRevealedToken] = useState<string>();
	const [copied, setCopied] = useState(false);
	const [target, setTarget] = useState<"apple" | "google" | "outlook">("apple");

	async function loadTokens() {
		setBusy(true);
		setError(undefined);
		try {
			const response = await fetch("/api/calendar/feed-tokens", { cache: "no-store" });
			if (!response.ok) throw new Error(await readError(response));
			const payload = (await response.json()) as { tokens: FeedToken[] };
			setTokens(payload.tokens);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not load calendar links.");
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		if (open) void loadTokens();
		if (!open) {
			setRevealedToken(undefined);
			setCopied(false);
		}
	}, [open]);

	async function createLink() {
		setBusy(true);
		setError(undefined);
		try {
			const response = await fetch("/api/calendar/feed-tokens", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Journal calendar" }),
			});
			if (!response.ok) throw new Error(await readError(response));
			const payload = (await response.json()) as { token: FeedToken & { token: string } };
			setRevealedToken(payload.token.token);
			setTokens((current) => [payload.token, ...current]);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not create calendar link.");
		} finally {
			setBusy(false);
		}
	}

	async function revokeLink(id: string) {
		setBusy(true);
		try {
			const response = await fetch(`/api/calendar/feed-tokens/${id}`, { method: "DELETE" });
			if (!response.ok) throw new Error(await readError(response));
			setTokens((current) => current.filter((token) => token.id !== id));
			setRevealedToken(undefined);
			showUserToast("Calendar subscription revoked.", "success");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not revoke calendar link.");
		} finally {
			setBusy(false);
		}
	}

	async function rotateLink(id: string) {
		setBusy(true);
		setError(undefined);
		try {
			const response = await fetch(`/api/calendar/feed-tokens/${id}/rotate`, {
				method: "POST",
			});
			if (!response.ok) throw new Error(await readError(response));
			const payload = (await response.json()) as { token: FeedToken & { token: string } };
			setTokens((current) => [payload.token, ...current.filter((token) => token.id !== id)]);
			setRevealedToken(payload.token.token);
			showUserToast("Calendar link rotated. Update it in your calendar app.", "success");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not rotate calendar link.");
		} finally {
			setBusy(false);
		}
	}

	const activeTokens = tokens.filter((token) => !token.revokedAt);
	const httpsUrl =
		revealedToken && typeof window !== "undefined"
			? `${window.location.origin}/api/calendar/feed/${revealedToken}`
			: undefined;
	const webcalUrl = httpsUrl?.replace(/^https?:/, "webcal:");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Live calendar subscription</DialogTitle>
					<DialogDescription>
						Subscribe once in Apple Calendar, Outlook, or Google Calendar. Journal
						changes then appear when that app refreshes the feed.
					</DialogDescription>
				</DialogHeader>

				{error && (
					<p role="alert" className="text-xs text-destructive">
						{error}
					</p>
				)}

				{httpsUrl && (
					<div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
						<p className="text-xs font-medium">New subscription link</p>
						<p className="break-all font-mono text-[10px] text-muted-foreground">
							{httpsUrl}
						</p>
						<p className="text-[11px] text-amber-600 dark:text-amber-500">
							This secret is shown once. Anyone with it can read your journal
							calendar.
						</p>
						<div className="flex gap-1.5" role="tablist" aria-label="Calendar app">
							{(
								[
									["apple", "Apple"],
									["google", "Google"],
									["outlook", "Outlook"],
								] as const
							).map(([id, name]) => (
								<button
									key={id}
									type="button"
									role="tab"
									aria-selected={target === id}
									onClick={() => setTarget(id)}
									className={
										target === id
											? "rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background"
											: "rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
									}
								>
									{name}
								</button>
							))}
						</div>
						{target === "apple" ? (
							<div className="space-y-2">
								<p className="text-[11px] text-muted-foreground">
									One click: the Subscribe button opens Apple Calendar (or your
									default calendar app) with this feed pre-filled.
								</p>
								<a
									href={webcalUrl}
									className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-xs font-medium text-background"
								>
									<CalendarClock className="h-3.5 w-3.5" /> Subscribe
								</a>
							</div>
						) : (
							<div className="space-y-2">
								<ol className="list-decimal space-y-1 pl-4 text-[11px] text-muted-foreground">
									<li>Copy the URL.</li>
									<li>
										{target === "google"
											? 'The button opens Google Calendar’s "From URL" page — paste and click "Add calendar".'
											: 'The button opens Outlook’s "Subscribe from web" — paste, name it, and click "Import".'}
									</li>
								</ol>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={async () => {
											await navigator.clipboard.writeText(httpsUrl);
											setCopied(true);
										}}
										className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs"
									>
										{copied ? (
											<Check className="h-3.5 w-3.5" />
										) : (
											<Copy className="h-3.5 w-3.5" />
										)}
										{copied ? "Copied" : "Copy URL"}
									</button>
									<a
										href={
											target === "google"
												? "https://calendar.google.com/calendar/r/settings/addbyurl"
												: "https://outlook.live.com/calendar/0/addcalendar"
										}
										target="_blank"
										rel="noreferrer"
										className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-xs font-medium text-background"
									>
										<CalendarClock className="h-3.5 w-3.5" />
										{target === "google"
											? "Open Google Calendar"
											: "Open Outlook"}
									</a>
								</div>
							</div>
						)}
					</div>
				)}

				<div className="space-y-2">
					{busy && activeTokens.length === 0 ? (
						<p className="flex items-center gap-2 text-xs text-muted-foreground">
							<Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
						</p>
					) : activeTokens.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							No active subscription links.
						</p>
					) : (
						activeTokens.map((token) => (
							<div
								key={token.id}
								className="flex items-center gap-2 rounded-md border border-border p-2.5"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs font-medium">{token.name}</p>
									<p className="text-[10px] text-muted-foreground">
										{token.lastUsedAt
											? `Last refreshed ${new Date(token.lastUsedAt).toLocaleString()}`
											: "Not refreshed yet"}
									</p>
								</div>
								<button
									type="button"
									aria-label="Rotate link"
									disabled={busy}
									onClick={() => void rotateLink(token.id)}
									className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
								>
									<RefreshCw className="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									aria-label="Revoke link"
									disabled={busy}
									onClick={() => void revokeLink(token.id)}
									className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
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
						disabled={busy}
						onClick={() => void createLink()}
						className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50"
					>
						{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
						Create subscription link
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
