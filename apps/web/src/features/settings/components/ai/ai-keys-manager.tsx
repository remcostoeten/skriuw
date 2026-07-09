"use client";

import { useEffect, useState } from "react";
import { CheckCircle, CircleAlert, Clock, KeyRound, LoaderCircle, Plus } from "lucide-react";
import { DeleteButton } from "@/shared/ui/delete-button";
import type { AiProviderKeySummary, AiUsageLogRow } from "@/domain/ai/types";
import { AiUsageLog } from "@/features/settings/components/ai/ai-usage-log";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { settingsFocusDomId } from "@/features/settings/lib/settings-focus-anchor";

type LoadState = "idle" | "loading" | "error";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "UTC",
});

function StatusBadge({ status }: { status: string }) {
	const ok = status === "success" || status === "valid";
	const warning = status === "rate_limited" || status === "untested";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
				ok && "border-success/25 bg-success/10 text-success",
				warning && "border-warning/25 bg-warning/10 text-warning",
				!ok && !warning && "border-destructive/25 bg-destructive/10 text-destructive",
			)}
		>
			{ok ? <CheckCircle className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
			{status.replace("_", " ")}
		</span>
	);
}

function formatDate(value: string | null) {
	if (!value) return "Never";
	return DATE_FORMATTER.format(new Date(value));
}

export function AiKeysManager({ isSignedIn }: { isSignedIn: boolean }) {
	const [keys, setKeys] = useState<AiProviderKeySummary[]>([]);
	const [keyState, setKeyState] = useState<LoadState>("idle");
	const [keyError, setKeyError] = useState<string | null>(null);
	const [usage, setUsage] = useState<AiUsageLogRow[]>([]);
	const [usageState, setUsageState] = useState<LoadState>("idle");
	const [usageError, setUsageError] = useState<string | null>(null);
	const [nextOffset, setNextOffset] = useState<number | null>(null);
	const [label, setLabel] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [provider, setProvider] = useState<"google" | "groq">("google");
	const [saving, setSaving] = useState(false);
	const [testingId, setTestingId] = useState<string | null>(null);

	async function loadKeys() {
		if (!isSignedIn) return;
		setKeyState("loading");
		setKeyError(null);
		try {
			const res = await fetch("/api/ai/keys");
			if (!res.ok) throw new Error("Could not load AI keys.");
			const data = (await res.json()) as { keys: AiProviderKeySummary[] };
			setKeys(data.keys);
			setKeyState("idle");
		} catch (error) {
			setKeyError(error instanceof Error ? error.message : "Could not load AI keys.");
			setKeyState("error");
		}
	}

	async function loadUsage(offset = 0) {
		if (!isSignedIn) return;
		setUsageState("loading");
		setUsageError(null);
		try {
			const res = await fetch(`/api/ai/usage?limit=20&offset=${offset}`);
			if (!res.ok) throw new Error("Could not load AI usage.");
			const data = (await res.json()) as {
				usage: AiUsageLogRow[];
				nextOffset: number | null;
			};
			setUsage((current) => (offset === 0 ? data.usage : [...current, ...data.usage]));
			setNextOffset(data.nextOffset);
			setUsageState("idle");
		} catch (error) {
			setUsageError(error instanceof Error ? error.message : "Could not load AI usage.");
			setUsageState("error");
		}
	}

	useEffect(() => {
		void loadKeys();
		void loadUsage(0);
	}, [isSignedIn]);

	async function saveKey() {
		if (!label.trim() || !apiKey.trim()) return;
		setSaving(true);
		setKeyError(null);
		try {
			const res = await fetch("/api/ai/keys", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider, label, apiKey }),
			});
			const data = (await res.json().catch(() => ({}))) as {
				key?: AiProviderKeySummary;
				error?: string;
			};
			if (!res.ok || !data.key) throw new Error(data.error ?? "Could not save AI key.");
			setKeys((current) => [data.key!, ...current.filter((key) => key.id !== data.key!.id)]);
			setLabel("");
			setApiKey("");
		} catch (error) {
			setKeyError(error instanceof Error ? error.message : "Could not save AI key.");
		} finally {
			setSaving(false);
		}
	}

	async function deleteKey(keyId: string): Promise<boolean> {
		setKeyError(null);
		try {
			const res = await fetch(`/api/ai/keys/${keyId}`, { method: "DELETE" });
			if (!res.ok) {
				setKeyError("Could not remove AI key.");
				return false;
			}
			setKeys((current) => current.filter((key) => key.id !== keyId));
			return true;
		} catch (error) {
			setKeyError(error instanceof Error ? error.message : "Could not remove AI key.");
			return false;
		}
	}

	async function renameKey(key: AiProviderKeySummary) {
		const nextLabel = window.prompt("Key label", key.label)?.trim();
		if (!nextLabel || nextLabel === key.label) return;
		const res = await fetch(`/api/ai/keys/${key.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ label: nextLabel }),
		});
		const data = (await res.json().catch(() => ({}))) as {
			key?: AiProviderKeySummary;
			error?: string;
		};
		if (!res.ok || !data.key) {
			setKeyError(data.error ?? "Could not update AI key.");
			return;
		}
		setKeys((current) => current.map((item) => (item.id === key.id ? data.key! : item)));
	}

	async function testKey(keyId: string) {
		setTestingId(keyId);
		setKeyError(null);
		try {
			const res = await fetch(`/api/ai/keys/${keyId}/test`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(data.message ?? "Key test failed.");
			}
			await loadKeys();
			await loadUsage(0);
		} catch (error) {
			setKeyError(error instanceof Error ? error.message : "Key test failed.");
			await loadKeys();
		} finally {
			setTestingId(null);
		}
	}

	if (!isSignedIn) {
		return (
			<div className="rounded-lg border border-border/60 bg-card/40 px-5 py-4">
				<p className="text-sm text-muted-foreground">
					Sign in to manage encrypted provider keys and view activity.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div
				id={settingsFocusDomId("keys-server")}
				data-settings-focus="keys-server"
				className="rounded-lg border border-border/60 bg-card/40 px-5 py-4 scroll-mt-24"
			>
				<div className="flex items-start justify-between gap-4">
					<div className="space-y-1">
						<h3 className="text-sm font-medium text-foreground">Server keys</h3>
						<p className="text-xs text-muted-foreground">
							User-owned provider keys stay encrypted server-side. Raw values are
							never shown after save.
						</p>
					</div>
					<KeyRound className="h-4 w-4 text-muted-foreground" />
				</div>

				<div className="my-4 border-t border-border/50" />

				<div className="space-y-3">
					<div className="flex gap-1">
						{(["google", "groq"] as const).map((p) => (
							<button
								key={p}
								type="button"
								onClick={() => setProvider(p)}
								className={cn(
									"border px-3 py-1 text-xs transition-colors",
									provider === p
										? "border-ring bg-accent text-accent-foreground"
										: "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{p === "google" ? "Google" : "Groq"}
							</button>
						))}
					</div>
					<div className="grid gap-2 sm:grid-cols-[0.85fr_1.15fr]">
						<input
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							placeholder={
								provider === "google" ? "Personal Gemini" : "Personal Groq"
							}
							className="h-10 border border-border bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring md:text-sm"
						/>
						<input
							value={apiKey}
							onChange={(event) => setApiKey(event.target.value)}
							placeholder={provider === "google" ? "Google API key" : "Groq API key"}
							type="password"
							autoComplete="off"
							spellCheck={false}
							className="h-10 border border-border bg-background px-3 font-mono text-base outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring md:text-sm"
						/>
					</div>
					<Button
						type="button"
						onClick={() => void saveKey()}
						disabled={!label.trim() || !apiKey.trim() || saving}
						className="h-10"
					>
						{saving ? (
							<LoaderCircle className="h-4 w-4 animate-spin" />
						) : (
							<Plus className="h-4 w-4" />
						)}
						Save key
					</Button>
				</div>

				{keyError ? <p className="mt-4 text-sm text-destructive">{keyError}</p> : null}

				<div className="mt-5 space-y-2">
					{keyState === "loading" && keys.length === 0 ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<LoaderCircle className="h-4 w-4 animate-spin" />
							Loading keys
						</div>
					) : null}

					{keys.length === 0 && keyState !== "loading" ? (
						<div className="border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
							No AI provider keys saved yet.
						</div>
					) : null}

					{keys.map((key) => (
						<div key={key.id} className="border border-border bg-background p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<p className="truncate text-sm font-medium text-foreground">
											{key.label}
										</p>
										<StatusBadge status={key.status} />
									</div>
									<p className="font-mono text-xs text-muted-foreground">
										{key.provider === "google" ? "Google" : "Groq"} ·{" "}
										{key.keyPreview}
									</p>
									<p className="flex items-center gap-1 text-xs text-muted-foreground/70">
										<Clock className="h-3 w-3" />
										Tested {formatDate(key.lastTestedAt)}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<Button
										type="button"
										variant="outline"
										className="h-8 border-border bg-transparent px-2 text-xs"
										onClick={() => void renameKey(key)}
									>
										Rename
									</Button>
									<Button
										type="button"
										variant="outline"
										className="h-8 border-border bg-transparent px-2 text-xs"
										onClick={() => void testKey(key.id)}
										disabled={testingId === key.id}
									>
										{testingId === key.id ? (
											<LoaderCircle className="h-3 w-3 animate-spin" />
										) : null}
										Test
									</Button>
									<DeleteButton
										onDelete={() => deleteKey(key.id)}
										confirmLabel="Confirm remove"
										pendingLabel="Removing"
										successLabel="Removed"
										failedLabel="Retry"
									/>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			<AiUsageLog
				usage={usage}
				usageState={usageState}
				usageError={usageError}
				nextOffset={nextOffset}
				onLoadMore={(offset) => void loadUsage(offset)}
			/>
		</div>
	);
}
