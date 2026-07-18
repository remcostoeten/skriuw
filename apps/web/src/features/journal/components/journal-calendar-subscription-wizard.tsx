"use client";

import { useState } from "react";
import { ArrowLeft, Check, ExternalLink, Loader2 } from "lucide-react";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { cn } from "@/shared/lib/utils";
import { parseJournalIcs, MAX_ICS_IMPORT_BYTES } from "@/domain/journal/ics-import";
import { normalizeLocalSubscriptionUrl } from "@/features/journal/lib/local-calendar-subscriptions";

type Provider = "google" | "icloud" | "outlook" | "other";

type Preview = {
	calendarName: string | null;
	importable: number;
	skipped: number;
	sampleTitles: string[];
};

type Step = "provider" | "instructions" | "url" | "mode";

type Props = {
	onComplete: (input: { url: string; label: string; mode: "skip" | "update" }) => Promise<void>;
	onCancel: () => void;
};

const PROVIDERS: Array<{ id: Provider; name: string; hint: string }> = [
	{ id: "google", name: "Google Calendar", hint: "Personal or work Google account" },
	{ id: "icloud", name: "Apple iCloud", hint: "Calendars on your iPhone, iPad, or Mac" },
	{ id: "outlook", name: "Outlook", hint: "Outlook.com or Microsoft 365" },
	{ id: "other", name: "Something else", hint: "Any app that offers an ICS/iCal link" },
];

const INSTRUCTIONS: Record<Provider, { steps: string[]; link?: { href: string; label: string } }> =
	{
		google: {
			steps: [
				"Open Google Calendar settings (button below).",
				"In the left list, click the calendar you want to bring into Skriuw.",
				'Scroll to "Integrate calendar".',
				'Copy the "Secret address in iCal format" (ends in .ics). Treat it like a password.',
			],
			link: {
				href: "https://calendar.google.com/calendar/r/settings",
				label: "Open Google Calendar settings",
			},
		},
		icloud: {
			steps: [
				"Open iCloud Calendar (button below) or the Calendar app on your iPhone/Mac.",
				"Tap the share icon next to the calendar you want.",
				'Enable "Public Calendar".',
				"Copy the webcal:// link — paste it as-is, Skriuw converts it.",
			],
			link: { href: "https://www.icloud.com/calendar/", label: "Open iCloud Calendar" },
		},
		outlook: {
			steps: [
				"Open Outlook calendar settings (button below).",
				'Go to "Shared calendars" → "Publish a calendar".',
				"Select the calendar and a permission level, then publish.",
				"Copy the ICS link.",
			],
			link: {
				href: "https://outlook.live.com/calendar/options/calendar/SharedCalendars",
				label: "Open Outlook calendar settings",
			},
		},
		other: {
			steps: [
				'Look for "Export", "Share", "Subscribe", or "iCal feed" in your calendar app.',
				"You need a URL ending in .ics (or starting with webcal://) — not a downloaded file.",
				"For one-time .ics files, use Import .ics file in the Calendar menu instead.",
			],
		},
	};

function stepIndex(step: Step): number {
	return ["provider", "instructions", "url", "mode"].indexOf(step);
}

export function JournalCalendarSubscriptionWizard({ onComplete, onCancel }: Props) {
	const backend = useWorkspaceBackend();
	const [step, setStep] = useState<Step>("provider");
	const [provider, setProvider] = useState<Provider>("google");
	const [url, setUrl] = useState("");
	const [preview, setPreview] = useState<Preview>();
	const [mode, setMode] = useState<"skip" | "update">("skip");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();

	async function testFetch() {
		setBusy(true);
		setError(undefined);
		try {
			if (backend.mode === "server") {
				const response = await fetch("/api/calendar/subscriptions/preview", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ url }),
				});
				const payload = (await response.json().catch(() => ({}))) as {
					preview?: Preview;
					error?: string;
				};
				if (!payload.preview)
					throw new Error(payload.error || "Could not fetch that calendar.");
				setPreview(payload.preview);
			} else {
				const normalized = normalizeLocalSubscriptionUrl(url);
				const response = await fetch(normalized, {
					signal: AbortSignal.timeout(15_000),
					cache: "no-store",
				});
				if (!response.ok) {
					throw new Error(`The calendar host responded with status ${response.status}.`);
				}
				const text = await response.text();
				if (new TextEncoder().encode(text).length > MAX_ICS_IMPORT_BYTES) {
					throw new Error("The calendar file is too large — the limit is 5 MB.");
				}
				const parsed = parseJournalIcs(text);
				setPreview({
					calendarName: parsed.calendarName ?? null,
					importable: parsed.events.length,
					skipped: parsed.skipped.length,
					sampleTitles: parsed.events
						.slice(0, 3)
						.map((event) => event.title || event.dateKey),
				});
			}
			setStep("mode");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not fetch that calendar.");
		} finally {
			setBusy(false);
		}
	}

	async function finish() {
		setBusy(true);
		setError(undefined);
		try {
			const providerName = PROVIDERS.find((entry) => entry.id === provider)?.name;
			await onComplete({
				url,
				label: preview?.calendarName || providerName || "External calendar",
				mode,
			});
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not add that calendar.");
			setBusy(false);
		}
	}

	const instructions = INSTRUCTIONS[provider];

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				{step !== "provider" && (
					<button
						type="button"
						aria-label="Back"
						onClick={() => {
							setError(undefined);
							setStep(
								step === "mode"
									? "url"
									: step === "url"
										? "instructions"
										: "provider",
							);
						}}
						className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<ArrowLeft className="h-3.5 w-3.5" />
					</button>
				)}
				<div className="flex flex-1 items-center gap-1.5" aria-hidden>
					{(["provider", "instructions", "url", "mode"] as const).map((entry) => (
						<div
							key={entry}
							className={cn(
								"h-1 flex-1 rounded-full",
								stepIndex(entry) <= stepIndex(step) ? "bg-foreground" : "bg-border",
							)}
						/>
					))}
				</div>
				<span className="text-[10px] text-muted-foreground">
					Step {stepIndex(step) + 1} of 4
				</span>
			</div>

			{error && (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			)}

			{step === "provider" && (
				<div className="space-y-2">
					<p className="text-xs text-muted-foreground">Where does the calendar live?</p>
					{PROVIDERS.map((entry) => (
						<button
							key={entry.id}
							type="button"
							onClick={() => {
								setProvider(entry.id);
								setStep("instructions");
							}}
							className="flex w-full items-center justify-between rounded-md border border-border p-2.5 text-left hover:bg-muted"
						>
							<span>
								<span className="block text-xs font-medium">{entry.name}</span>
								<span className="block text-[10px] text-muted-foreground">
									{entry.hint}
								</span>
							</span>
						</button>
					))}
				</div>
			)}

			{step === "instructions" && (
				<div className="space-y-3">
					<ol className="list-decimal space-y-1.5 pl-4 text-xs text-foreground">
						{instructions.steps.map((text) => (
							<li key={text}>{text}</li>
						))}
					</ol>
					<div className="flex flex-wrap gap-2">
						{instructions.link && (
							<a
								href={instructions.link.href}
								target="_blank"
								rel="noreferrer"
								className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs"
							>
								<ExternalLink className="h-3.5 w-3.5" />
								{instructions.link.label}
							</a>
						)}
						<button
							type="button"
							onClick={() => setStep("url")}
							className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background"
						>
							I copied the link
						</button>
					</div>
				</div>
			)}

			{step === "url" && (
				<div className="space-y-2">
					<p className="text-xs text-muted-foreground">
						Paste the calendar link. Skriuw fetches it once now to confirm it works —
						nothing is imported yet.
					</p>
					<input
						type="url"
						autoFocus
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && url.trim() && !busy) void testFetch();
						}}
						placeholder={
							provider === "icloud"
								? "webcal://p123-caldav.icloud.com/published/…"
								: "https://…/basic.ics"
						}
						aria-label="Calendar URL"
						className="h-8 w-full rounded-md border border-border bg-transparent px-2.5 text-xs"
					/>
					<button
						type="button"
						disabled={busy || !url.trim()}
						onClick={() => void testFetch()}
						className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50"
					>
						{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
						Test the link
					</button>
				</div>
			)}

			{step === "mode" && preview && (
				<div className="space-y-3">
					<div className="rounded-md border border-border bg-muted/40 p-3">
						<p className="flex items-center gap-1.5 text-xs font-medium">
							<Check className="h-3.5 w-3.5 text-green-600" />
							{preview.calendarName || "Calendar"} — {preview.importable} events found
							{preview.skipped > 0 &&
								` (${preview.skipped} unsupported, e.g. recurring)`}
						</p>
						{preview.sampleTitles.length > 0 && (
							<p className="mt-1 truncate text-[10px] text-muted-foreground">
								For example: {preview.sampleTitles.join(" · ")}
							</p>
						)}
					</div>
					<p className="text-xs text-muted-foreground">
						When an imported event lands on a day you already journaled, what should
						happen?
					</p>
					<div className="space-y-2">
						<label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5">
							<input
								type="radio"
								name="wizard-mode"
								checked={mode === "skip"}
								onChange={() => setMode("skip")}
								className="mt-0.5"
							/>
							<span>
								<span className="block text-xs font-medium">
									Keep my entry (recommended)
								</span>
								<span className="block text-[10px] text-muted-foreground">
									Days you wrote on are never touched. Calendar events only fill
									empty days.
								</span>
							</span>
						</label>
						<label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5">
							<input
								type="radio"
								name="wizard-mode"
								checked={mode === "update"}
								onChange={() => setMode("update")}
								className="mt-0.5"
							/>
							<span>
								<span className="block text-xs font-medium">
									Let the calendar update entries
								</span>
								<span className="block text-[10px] text-muted-foreground">
									Events it imported earlier are kept in sync, replacing that
									entry&apos;s text when the event changes.
								</span>
							</span>
						</label>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={busy}
							onClick={() => void finish()}
							className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50"
						>
							{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
							Start syncing daily
						</button>
						<button
							type="button"
							onClick={onCancel}
							className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs"
						>
							Cancel
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
