"use client";
/* eslint-disable react-doctor/no-giant-component, react-doctor/prefer-useReducer */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
	Check,
	Copy,
	Download,
	Clock3,
	KeyRound,
	Plus,
	RotateCcw,
	ShieldCheck,
	Sparkles,
	Trash2,
	Upload,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { DeleteButton } from "@/shared/ui/delete-button";
import { GuestGate } from "@/shared/ui/guest-gate";
import { AnimatedList } from "@/shared/ui/animated-list";
import { showUserToast } from "@/shared/lib/user-toast";
import { cn } from "@/shared/lib/utils";
import { useIsGuestWorkspace, resetGuestStorage, isTauriRuntime } from "@/core/workspace-backend";
import { LocalDataSection } from "./local-data-section";
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
	SectionHeader,
	Row,
	SettingsCard,
	GroupLabel,
} from "@/features/settings/components/settings-primitives";
import { settingsFocusDomId } from "@/features/settings/lib/settings-focus-anchor";
import { NoteCleanupDialog, NoteCleanupRow } from "@/features/settings/components/note-cleanup";
import { useNoteCleanupScan } from "@/features/settings/lib/use-note-cleanup-scan";
import { useAuth } from "@/core/auth/use-auth";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { clearAllData } from "@/features/settings/actions/clear-data";
import { useNotesStore } from "@/features/notes/store";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { journalKeys } from "@/features/journal/hooks/journal-keys";
import type {
	ImportMergeResult,
	ImportPolicy,
	ImportPreview,
	ImportProfile,
} from "@/domain/data-transfer/types";
import { RustImportDialog } from "@/features/settings/components/rust-import-dialog";
import { StorageConfigManager } from "@/features/settings/components/storage/storage-config-manager";
import { CoverGalleryManager } from "@/features/settings/components/storage/cover-gallery-manager";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

const REPLACE_PHRASE = "replace my workspace";

type ExportState = "idle" | "pending" | "error";
type ImportFlowState = "idle" | "previewing" | "ready" | "importing" | "success" | "error";
type TokenLoadState = "idle" | "loading" | "error";

type SyncTokenSummary = {
	id: string;
	name: string;
	tokenPrefix: string;
	scopes: string[];
	expiresAt: string | null;
	revokedAt: string | null;
	lastUsedAt: string | null;
	createdAt: string;
};

type CreatedSyncToken = SyncTokenSummary & {
	token: string;
};

type SyncEventSummary = {
	id: string;
	tokenId: string | null;
	operation: "capture" | "export" | "folders" | "push";
	status: "success" | "error";
	resourceId: string | null;
	resourceName: string | null;
	message: string | null;
	source: string | null;
	createdAt: string;
};

function syncEventOperationLabel(operation: SyncEventSummary["operation"]): string {
	switch (operation) {
		case "capture":
			return "Capture";
		case "export":
			return "Export";
		case "folders":
			return "Folders";
		case "push":
			return "Desktop sync";
	}
}

function importHasWork(preview: ImportPreview): boolean {
	if (preview.policy === "replace-workspace") {
		return true;
	}

	return (
		preview.folders.create +
			preview.folders.overwrite +
			preview.notes.create +
			preview.notes.overwrite +
			preview.journalEntries.create +
			preview.journalEntries.overwrite +
			preview.journalTags.create +
			preview.noteVersions.create >
		0
	);
}

function importProgressTotal(preview: ImportPreview | null): number {
	if (!preview) return 0;
	return preview.notes.create + preview.notes.overwrite;
}

function ImportProgress({ imported, total }: { imported: number; total: number }) {
	const safeTotal = Math.max(total, 1);
	const percent = Math.min(100, Math.round((imported / safeTotal) * 100));

	return (
		<div className="space-y-2" aria-live="polite">
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>Importing notes</span>
				<span>
					{imported}/{total} notes imported
				</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-primary transition-all duration-300"
					style={{ width: `${percent}%` }}
				/>
			</div>
		</div>
	);
}

function ImportPreviewSummary({ preview }: { preview: ImportPreview }) {
	const totalCreate =
		preview.folders.create +
		preview.notes.create +
		preview.journalEntries.create +
		preview.journalTags.create +
		preview.noteVersions.create;
	const totalOverwrite =
		preview.notes.overwrite + preview.journalEntries.overwrite + preview.journalTags.overwrite;

	if (preview.policy !== "replace-workspace" && totalCreate === 0 && totalOverwrite === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Everything in this archive already exists in your workspace. Nothing will change.
			</p>
		);
	}

	return (
		<div className="space-y-3 text-sm">
			<ul className="space-y-1.5 text-muted-foreground">
				<li>
					{preview.folders.create} folders to create
					{preview.folders.skip > 0 ? ` · ${preview.folders.skip} skipped` : ""}
				</li>
				<li>
					{preview.notes.create} notes to create
					{preview.notes.overwrite > 0
						? ` · ${preview.notes.overwrite} to overwrite`
						: ""}
					{preview.notes.skip > 0 ? ` · ${preview.notes.skip} skipped` : ""}
				</li>
				<li>
					{preview.journalEntries.create} journal entries to create
					{preview.journalEntries.overwrite > 0
						? ` · ${preview.journalEntries.overwrite} to overwrite`
						: ""}
				</li>
				<li>
					{preview.journalTags.create} journal tags to create
					{preview.journalTags.overwrite > 0
						? ` · ${preview.journalTags.overwrite} to update`
						: ""}
				</li>
				{preview.noteVersions.create > 0 && (
					<li>{preview.noteVersions.create} note versions to restore</li>
				)}
			</ul>
			{(preview.samples.notesToCreate.length > 0 ||
				preview.samples.notesToOverwrite.length > 0 ||
				preview.samples.journalToCreate.length > 0 ||
				preview.samples.journalToOverwrite.length > 0) && (
				<div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
					{preview.samples.notesToCreate.length > 0 && (
						<p>Create notes: {preview.samples.notesToCreate.join(", ")}</p>
					)}
					{preview.samples.notesToOverwrite.length > 0 && (
						<p className="mt-1">
							Overwrite notes: {preview.samples.notesToOverwrite.join(", ")}
						</p>
					)}
					{preview.samples.journalToCreate.length > 0 && (
						<p className="mt-1">
							Create journal: {preview.samples.journalToCreate.join(", ")}
						</p>
					)}
					{preview.samples.journalToOverwrite.length > 0 && (
						<p className="mt-1">
							Overwrite journal: {preview.samples.journalToOverwrite.join(", ")}
						</p>
					)}
				</div>
			)}
			{preview.integrityWarnings.length > 0 && (
				<ul className="space-y-1 text-xs text-warning-foreground">
					{preview.integrityWarnings.map((warning) => (
						<li key={warning}>{warning}</li>
					))}
				</ul>
			)}
			{preview.warnings.length > 0 && (
				<ul className="space-y-1 text-xs text-warning-foreground">
					{preview.warnings.map((warning) => (
						<li key={warning}>{warning}</li>
					))}
				</ul>
			)}
		</div>
	);
}

const SYNC_TOKEN_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "UTC",
});

type SyncTokenExpiry = "never" | "30d" | "90d";

function formatSyncTokenDate(value: string | null): string {
	if (!value) return "Never";
	return SYNC_TOKEN_DATE_FORMAT.format(new Date(value));
}

function syncTokenExpiresAt(expiry: SyncTokenExpiry): string | null {
	if (expiry === "never") return null;
	const days = expiry === "30d" ? 30 : 90;
	const date = new Date();
	date.setDate(date.getDate() + days);
	return date.toISOString();
}

function syncTokenScopeLabel(scopes: string[]): string {
	return scopes.includes("sync:write") ? "Capture + sync" : "Read only";
}

function DesktopSyncTokens({ isConnected }: { isConnected: boolean }) {
	const [tokens, setTokens] = useState<SyncTokenSummary[]>([]);
	const [loadState, setLoadState] = useState<TokenLoadState>("idle");
	const [error, setError] = useState<string | null>(null);
	const [tokenName, setTokenName] = useState("Browser extension");
	const [canWrite, setCanWrite] = useState(true);
	const [expiry, setExpiry] = useState<SyncTokenExpiry>("90d");
	const [createdToken, setCreatedToken] = useState<CreatedSyncToken | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [rotatingId, setRotatingId] = useState<string | null>(null);
	const [revokingAll, setRevokingAll] = useState(false);
	const [copied, setCopied] = useState(false);
	const [events, setEvents] = useState<SyncEventSummary[]>([]);
	const [activityTokenId, setActivityTokenId] = useState<string | null>(null);

	const activeTokens = tokens.filter((token) => !token.revokedAt);
	const revokedTokens = tokens.filter((token) => token.revokedAt);

	const loadTokens = useCallback(async () => {
		if (!isConnected) return;
		setLoadState("loading");
		setError(null);
		try {
			const response = await fetch("/api/sync/tokens");
			const body = (await response.json().catch(() => ({}))) as {
				tokens?: SyncTokenSummary[];
				error?: string;
			};
			if (!response.ok || !body.tokens) {
				throw new Error(body.error ?? "Could not load desktop sync tokens.");
			}
			setTokens(body.tokens);
			setLoadState("idle");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not load desktop sync tokens.");
			setLoadState("error");
		}
	}, [isConnected]);

	const loadActivity = useCallback(async () => {
		if (!isConnected) return;
		try {
			const query = activityTokenId
				? `limit=8&tokenId=${encodeURIComponent(activityTokenId)}`
				: "limit=8";
			const response = await fetch(`/api/sync/activity?${query}`);
			const body = (await response.json().catch(() => ({}))) as {
				events?: SyncEventSummary[];
			};
			if (response.ok && body.events) {
				setEvents(body.events);
			}
		} catch {
			setEvents([]);
		}
	}, [isConnected, activityTokenId]);

	useEffect(() => {
		void loadTokens();
	}, [loadTokens]);

	useEffect(() => {
		void loadActivity();
	}, [loadActivity]);

	async function createToken() {
		if (!isConnected || isCreating) return;
		setIsCreating(true);
		setError(null);
		setCopied(false);
		try {
			const response = await fetch("/api/sync/tokens", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: tokenName,
					canWrite,
					expiresAt: syncTokenExpiresAt(expiry),
				}),
			});
			const body = (await response.json().catch(() => ({}))) as {
				token?: CreatedSyncToken;
				error?: string;
			};
			if (!response.ok || !body.token) {
				throw new Error(body.error ?? "Could not create desktop sync token.");
			}
			setCreatedToken(body.token);
			setTokens((current) => [
				body.token!,
				...current.filter((token) => token.id !== body.token!.id),
			]);
			showUserToast("Sync key created.", "success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not create sync key.");
		} finally {
			setIsCreating(false);
		}
	}

	async function copyCreatedToken() {
		if (!createdToken) return;
		try {
			await navigator.clipboard.writeText(createdToken.token);
			setCopied(true);
			showUserToast("Token copied.", "success");
			setTimeout(() => setCopied(false), 1600);
		} catch {
			showUserToast("Could not copy token.", "error");
		}
	}

	async function revokeToken(tokenId: string) {
		setRevokingId(tokenId);
		setError(null);
		try {
			const response = await fetch(`/api/sync/tokens/${tokenId}`, { method: "DELETE" });
			const body = (await response.json().catch(() => ({}))) as { error?: string };
			if (!response.ok) {
				throw new Error(body.error ?? "Could not revoke desktop sync token.");
			}
			setTokens((current) =>
				current.map((token) =>
					token.id === tokenId
						? { ...token, revokedAt: new Date().toISOString() }
						: token,
				),
			);
			if (createdToken?.id === tokenId) {
				setCreatedToken(null);
			}
			showUserToast("Sync key revoked.", "success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not revoke sync key.");
		} finally {
			setRevokingId(null);
		}
	}

	async function rotateToken(tokenId: string) {
		setRotatingId(tokenId);
		setError(null);
		setCopied(false);
		try {
			const response = await fetch(`/api/sync/tokens/${tokenId}/rotate`, { method: "POST" });
			const body = (await response.json().catch(() => ({}))) as {
				token?: CreatedSyncToken;
				error?: string;
			};
			if (!response.ok || !body.token) {
				throw new Error(body.error ?? "Could not rotate sync key.");
			}
			setCreatedToken(body.token);
			setTokens((current) => [
				body.token!,
				...current.map((token) =>
					token.id === tokenId
						? { ...token, revokedAt: new Date().toISOString() }
						: token,
				),
			]);
			showUserToast(
				"Sync key rotated. Update the extension/desktop app with the new secret.",
				"success",
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not rotate sync key.");
		} finally {
			setRotatingId(null);
		}
	}

	async function revokeAllTokens() {
		if (activeTokens.length === 0) return;
		if (
			!window.confirm(
				`Revoke all ${activeTokens.length} active sync keys? Connected apps will lose access immediately.`,
			)
		) {
			return;
		}
		setRevokingAll(true);
		setError(null);
		try {
			const response = await fetch("/api/sync/tokens", { method: "DELETE" });
			const body = (await response.json().catch(() => ({}))) as { error?: string };
			if (!response.ok) {
				throw new Error(body.error ?? "Could not revoke sync keys.");
			}
			const revokedAt = new Date().toISOString();
			setTokens((current) =>
				current.map((token) => (token.revokedAt ? token : { ...token, revokedAt })),
			);
			setCreatedToken(null);
			showUserToast("All sync keys revoked.", "success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not revoke sync keys.");
		} finally {
			setRevokingAll(false);
		}
	}

	return (
		<SettingsCard>
			<div
				id={settingsFocusDomId("desktop-sync")}
				data-settings-focus="desktop-sync"
				className="py-5 scroll-mt-24"
			>
				<div className="@container overflow-hidden rounded-xl border border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)_/_0.14),transparent_34%),linear-gradient(135deg,hsl(var(--card)_/_0.88),hsl(var(--muted)_/_0.24))] shadow-[inset_0_1px_0_hsl(var(--foreground)_/_0.06)]">
					<div className="grid gap-5 p-4 @sm:p-5 @2xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
						<div className="min-w-0">
							<div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
								<KeyRound className="size-3.5" />
								Extension and desktop keys
							</div>
							<h3 className="mt-3 text-base font-semibold tracking-tight text-foreground">
								Connect the web clipper or desktop app without exposing your account
								session.
							</h3>
							<p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
								Generate a scoped key, copy it once, then paste it into the
								extension or desktop app. Keys can be revoked individually when a
								device is lost or replaced.
							</p>
							<div className="mt-4 grid gap-2 text-xs text-muted-foreground @sm:grid-cols-3">
								<div className="rounded-lg border border-border/60 bg-background/45 p-3">
									<p className="font-medium text-foreground">One-time reveal</p>
									<p className="mt-1">
										The full secret appears only after creation.
									</p>
								</div>
								<div className="rounded-lg border border-border/60 bg-background/45 p-3">
									<p className="font-medium text-foreground">Scoped access</p>
									<p className="mt-1">
										Choose read-only or capture/write access.
									</p>
								</div>
								<div className="rounded-lg border border-border/60 bg-background/45 p-3">
									<p className="font-medium text-foreground">Visible activity</p>
									<p className="mt-1">See when each key last touched sync.</p>
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm backdrop-blur">
							<Label
								htmlFor="desktop-sync-token-name"
								className="text-xs font-medium text-muted-foreground"
							>
								Key label
							</Label>
							<Input
								id="desktop-sync-token-name"
								value={tokenName}
								onChange={(event) => setTokenName(event.target.value)}
								disabled={!isConnected || isCreating}
								maxLength={80}
								placeholder="Browser extension"
								className="mt-1.5 bg-card/80"
							/>

							<div className="mt-4 space-y-2">
								<p className="text-xs font-medium text-muted-foreground">
									Access level
								</p>
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										disabled={!isConnected || isCreating}
										onClick={() => setCanWrite(false)}
										className={cn(
											"rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
											!canWrite
												? "border-primary/45 bg-primary/10 text-foreground"
												: "border-border/70 bg-card/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
										)}
									>
										<span className="block text-xs font-medium">Pull only</span>
										<span className="mt-1 block text-[11px] leading-4">
											Desktop export or restore.
										</span>
									</button>
									<button
										type="button"
										disabled={!isConnected || isCreating}
										onClick={() => setCanWrite(true)}
										className={cn(
											"rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
											canWrite
												? "border-primary/45 bg-primary/10 text-foreground"
												: "border-border/70 bg-card/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
										)}
									>
										<span className="block text-xs font-medium">
											Capture/write
										</span>
										<span className="mt-1 block text-[11px] leading-4">
											Required for web clipper.
										</span>
									</button>
								</div>
							</div>

							<div className="mt-4 space-y-2">
								<p className="text-xs font-medium text-muted-foreground">Expiry</p>
								<div className="grid grid-cols-3 gap-2">
									{[
										["30d", "30 days"],
										["90d", "90 days"],
										["never", "Never"],
									].map(([value, label]) => (
										<button
											key={value}
											type="button"
											disabled={!isConnected || isCreating}
											onClick={() => setExpiry(value as SyncTokenExpiry)}
											className={cn(
												"rounded-md border px-2 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
												expiry === value
													? "border-primary/45 bg-primary/10 text-foreground"
													: "border-border/70 bg-card/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
											)}
										>
											{label}
										</button>
									))}
								</div>
							</div>

							<Button
								className="mt-4 w-full"
								disabled={!isConnected || isCreating}
								onClick={createToken}
							>
								{isCreating ? (
									<Sparkles className="size-3.5 animate-pulse" />
								) : (
									<Plus className="size-3.5" />
								)}
								{isCreating ? "Generating…" : "Generate secret key"}
							</Button>
						</div>
					</div>
				</div>

				{createdToken && (
					<div className="mt-4 rounded-xl border border-warning/30 bg-[linear-gradient(135deg,hsl(var(--warning)_/_0.14),hsl(var(--card)_/_0.72))] p-4 shadow-[inset_0_1px_0_hsl(var(--foreground)_/_0.05)]">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div className="min-w-0 flex-1">
								<p className="inline-flex items-center gap-2 text-xs font-semibold text-foreground">
									<ShieldCheck className="size-3.5 text-warning-foreground" />
									Copy this secret key now
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									The full key will not be shown again after you leave this
									screen.
								</p>
								<code className="mt-3 block overflow-x-auto rounded-lg border border-border/70 bg-background/90 px-3 py-2.5 font-mono text-xs text-foreground shadow-inner">
									{createdToken.token}
								</code>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={copyCreatedToken}
								className="bg-background/75"
							>
								{copied ? (
									<Check className="size-3.5" />
								) : (
									<Copy className="size-3.5" />
								)}
								{copied ? "Copied" : "Copy"}
							</Button>
						</div>
					</div>
				)}

				{error && (
					<p role="alert" className="mt-3 text-xs text-destructive">
						{error}
					</p>
				)}

				<div className="mt-4 border-t border-border/50 pt-4">
					<div className="mb-2 flex items-center justify-between gap-3">
						<p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
							Active secret keys
						</p>
						<div className="flex items-center gap-1">
							{activeTokens.length > 0 && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => void revokeAllTokens()}
									disabled={revokingAll}
									className="text-destructive hover:bg-destructive/10 hover:text-destructive"
								>
									{revokingAll ? "Revoking…" : "Revoke all"}
								</Button>
							)}
							<Button
								variant="ghost"
								size="sm"
								onClick={() => void loadTokens()}
								disabled={!isConnected || loadState === "loading"}
							>
								{loadState === "loading" ? "Refreshing…" : "Refresh"}
							</Button>
						</div>
					</div>

					{!isConnected && (
						<p className="text-sm text-muted-foreground">
							Sign in to create extension and desktop sync keys.
						</p>
					)}

					{isConnected && loadState === "loading" && tokens.length === 0 && (
						<p className="text-sm text-muted-foreground">Loading sync keys…</p>
					)}

					{isConnected && loadState !== "loading" && activeTokens.length === 0 && (
						<div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
							No active sync keys yet. Generate one when you set up the web clipper or
							a new desktop device.
						</div>
					)}

					{activeTokens.length > 0 && (
						<AnimatedList
							items={activeTokens}
							className="space-y-2"
							renderItem={(token) => (
								<div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/60 p-3 shadow-[inset_0_1px_0_hsl(var(--foreground)_/_0.04)] sm:flex-row sm:items-center sm:justify-between">
									<button
										type="button"
										onClick={() =>
											setActivityTokenId((current) =>
												current === token.id ? null : token.id,
											)
										}
										className="min-w-0 flex-1 text-left"
										aria-label="Show this key's activity"
									>
										<div className="flex flex-wrap items-center gap-2">
											<p
												className={cn(
													"text-sm font-medium",
													activityTokenId === token.id
														? "text-primary"
														: "text-foreground",
												)}
											>
												{token.name}
											</p>
											<span className="rounded-md border border-border/70 bg-muted/35 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
												{token.tokenPrefix}…
											</span>
											<span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
												{syncTokenScopeLabel(token.scopes)}
											</span>
										</div>
										<p className="mt-1 text-xs text-muted-foreground">
											Created {formatSyncTokenDate(token.createdAt)} · Last
											used {formatSyncTokenDate(token.lastUsedAt)}
										</p>
										<p className="mt-0.5 text-xs text-muted-foreground">
											Expires {formatSyncTokenDate(token.expiresAt)}
										</p>
									</button>
									<div className="flex shrink-0 items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => void rotateToken(token.id)}
											disabled={rotatingId === token.id}
											aria-label="Issue a new secret, revoking this one"
										>
											<RotateCcw className="size-3.5" />
											{rotatingId === token.id ? "Rotating…" : "Rotate"}
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => void revokeToken(token.id)}
											disabled={revokingId === token.id}
											className="border-destructive/30 text-destructive hover:bg-destructive/10"
										>
											<Trash2 className="size-3.5" />
											{revokingId === token.id ? "Revoking…" : "Revoke"}
										</Button>
									</div>
								</div>
							)}
						/>
					)}
				</div>

				<div className="mt-4 border-t border-border/50 pt-4">
					<div className="mb-2 flex items-center justify-between gap-3">
						<p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
							Recent sync activity
							{activityTokenId && (
								<span className="ml-2 normal-case tracking-normal text-primary">
									· filtered to{" "}
									{tokens.find((token) => token.id === activityTokenId)?.name ??
										"key"}
								</span>
							)}
						</p>
						{activityTokenId ? (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setActivityTokenId(null)}
							>
								Clear filter
							</Button>
						) : (
							<span className="text-xs text-muted-foreground">
								{activeTokens.length} active · {revokedTokens.length} revoked
							</span>
						)}
					</div>
					{events.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
							{activityTokenId
								? "No activity for this key yet."
								: "No key has synced yet. Activity appears after an extension capture or desktop pull."}
						</div>
					) : (
						<div className="space-y-2">
							{events.map((event) => (
								<div
									key={event.id}
									className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2"
								>
									<div className="min-w-0">
										<p className="truncate text-sm font-medium text-foreground">
											{event.resourceName ??
												syncEventOperationLabel(event.operation)}
										</p>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{syncEventOperationLabel(event.operation)} ·{" "}
											{event.status}
											{event.message ? ` · ${event.message}` : ""}
										</p>
									</div>
									<div className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
										<Clock3 className="size-3.5" />
										{formatSyncTokenDate(event.createdAt)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</SettingsCard>
	);
}

export function DataSection() {
	if (isTauriRuntime()) {
		return <LocalDataSection />;
	}
	return <CloudDataSection />;
}

async function handleResetDemo() {
	await resetGuestStorage();
	window.location.reload();
}

async function uploadPreviewArchive(
	file: File,
	policy: ImportPolicy,
	profile: "auto" | ImportProfile,
): Promise<ImportPreview> {
	const formData = new FormData();
	formData.set("file", file);
	formData.set("policy", policy);
	if (profile !== "auto") {
		formData.set("profile", profile);
	}
	const response = await fetch("/api/data/import/preview", {
		method: "POST",
		body: formData,
	});
	const body = (await response.json().catch(() => null)) as
		| ({ error?: string } & Partial<ImportPreview>)
		| null;
	if (!response.ok) {
		throw new Error(body?.error ?? "Import request failed.");
	}
	return body as ImportPreview;
}

async function uploadImportArchive(
	file: File,
	policy: ImportPolicy,
	profile: "auto" | ImportProfile,
): Promise<ImportMergeResult> {
	const formData = new FormData();
	formData.set("file", file);
	formData.set("policy", policy);
	if (profile !== "auto") {
		formData.set("profile", profile);
	}
	const response = await fetch("/api/data/import", { method: "POST", body: formData });
	const body = (await response.json().catch(() => null)) as
		| ({ error?: string } & Partial<ImportMergeResult>)
		| null;
	if (!response.ok) {
		throw new Error(body?.error ?? "Import request failed.");
	}
	return body as ImportMergeResult;
}

function CloudDataSection() {
	const auth = useAuth();
	const isConnected = auth.phase === "authenticated";
	const isGuest = useIsGuestWorkspace();
	const isMobile = useIsMobile();
	const queryClient = useQueryClient();
	const router = useRouter();
	const resetNotesStore = useNotesStore((s) => s.resetUi);

	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleClearData = async (): Promise<boolean> => {
		const result = await clearAllData("clear my data");
		if (result.ok) {
			await queryClient.resetQueries({ queryKey: notesKeys.all });
			await queryClient.resetQueries({ queryKey: journalKeys.all });
			resetNotesStore();
			router.replace("/app");
			return true;
		}
		return false;
	};

	const [exportState, setExportState] = useState<ExportState>("idle");
	const [includeVersions, setIncludeVersions] = useState(true);
	const [importState, setImportState] = useState<ImportFlowState>("idle");
	const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
	const [importPolicy, setImportPolicy] = useState<ImportPolicy>("merge");
	const [importProfile, setImportProfile] = useState<"auto" | ImportProfile>("auto");
	const [replaceConfirm, setReplaceConfirm] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const [importDialogOpen, setImportDialogOpen] = useState(false);
	const [importProgress, setImportProgress] = useState({ imported: 0, total: 0 });
	const cleanup = useNoteCleanupScan();

	const handleExport = async () => {
		setExportState("pending");
		try {
			const query = includeVersions ? "" : "?includeVersions=false";
			const res = await fetch(`/api/data/export${query}`);
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Export failed.");
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			const date = new Date().toISOString().slice(0, 10);
			a.href = url;
			a.download = `skriuw-export-${date}.zip`;
			a.click();
			URL.revokeObjectURL(url);
			setExportState("idle");
		} catch {
			setExportState("error");
			setTimeout(() => setExportState("idle"), 3000);
		}
	};

	const resetImportFlow = () => {
		setImportState("idle");
		setImportPreview(null);
		setImportPolicy("merge");
		setImportProfile("auto");
		setReplaceConfirm("");
		setSelectedFile(null);
		setImportError(null);
		setImportProgress({ imported: 0, total: 0 });
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const previewArchive = async (
		file: File,
		policy: ImportPolicy,
		profile: "auto" | ImportProfile,
	) => {
		setImportState("previewing");
		setImportError(null);
		setImportPreview(null);
		try {
			const preview = await uploadPreviewArchive(file, policy, profile);
			setImportPreview(preview);
			setImportState("ready");
		} catch (error) {
			setImportState("error");
			setImportError(error instanceof Error ? error.message : "Import preview failed.");
		}
	};

	const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setSelectedFile(file);
		setImportDialogOpen(true);
		await previewArchive(file, importPolicy, importProfile);
	};

	const handleImportPolicyChange = async (policy: ImportPolicy) => {
		setImportPolicy(policy);
		if (selectedFile && importState !== "previewing" && importState !== "importing") {
			await previewArchive(selectedFile, policy, importProfile);
		}
	};

	const handleImportProfileChange = async (profile: "auto" | ImportProfile) => {
		setImportProfile(profile);
		if (selectedFile && importState !== "previewing" && importState !== "importing") {
			await previewArchive(selectedFile, importPolicy, profile);
		}
	};

	const handleConfirmImport = async () => {
		if (!selectedFile) return;
		if (
			importPolicy === "replace-workspace" &&
			replaceConfirm.trim().toLowerCase() !== REPLACE_PHRASE
		) {
			return;
		}
		setImportState("importing");
		setImportError(null);
		const total = importProgressTotal(importPreview);
		setImportProgress({ imported: 0, total });

		let simulatedProgress: number | undefined;
		try {
			if (total > 1) {
				simulatedProgress = window.setInterval(() => {
					setImportProgress((current) => ({
						imported: Math.min(current.imported + 1, Math.max(total - 1, 0)),
						total,
					}));
				}, 180);
			}
			await uploadImportArchive(selectedFile, importPolicy, importProfile);
			setImportProgress({ imported: total, total });
			await queryClient.invalidateQueries({ queryKey: notesKeys.all });
			await queryClient.invalidateQueries({ queryKey: journalKeys.all });
			setImportState("success");
		} catch (error) {
			setImportState("error");
			setImportError(error instanceof Error ? error.message : "Import failed.");
		} finally {
			if (simulatedProgress) window.clearInterval(simulatedProgress);
		}
	};

	return (
		<>
			<SectionHeader
				title="Data & sync"
				description="Your notes are yours. Export, import, or back them up anytime."
			/>
			<SettingsCard>
				<Row
					focusId="backup-sync"
					title="Export notes"
					description="Download notes, folders, journal entries, tags, and optional version history as a Skriuw v3 ZIP."
				>
					<div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
						<label className="flex items-center gap-2 text-xs text-muted-foreground">
							<input
								type="checkbox"
								checked={includeVersions}
								onChange={(event) => setIncludeVersions(event.target.checked)}
								className="size-3.5 rounded border border-border"
							/>
							Include version history
						</label>
						<GuestGate feature="export">
							<Button
								variant="outline"
								size="sm"
								onClick={handleExport}
								disabled={exportState === "pending" || !isConnected}
							>
								<Download className="size-3.5" />
								{exportState === "pending"
									? "Exporting…"
									: exportState === "error"
										? "Failed — retry"
										: "Export"}
							</Button>
						</GuestGate>
					</div>
				</Row>
				<Row
					focusId="import-backup"
					title="Import backup"
					description="Import a Skriuw backup, desktop snapshot, or Markdown folder ZIP. Choose merge, overwrite, or full workspace replace."
				>
					<>
						<input
							ref={fileInputRef}
							type="file"
							accept=".zip,application/zip"
							className="hidden"
							onChange={handleImportFileSelected}
						/>
						<GuestGate feature="export">
							<Button
								variant="outline"
								size="sm"
								disabled={
									!isConnected ||
									importState === "previewing" ||
									importState === "importing"
								}
								onClick={() => fileInputRef.current?.click()}
							>
								<Upload className="size-3.5" />
								{importState === "previewing" ? "Reading…" : "Import"}
							</Button>
						</GuestGate>
					</>
				</Row>
				{isTauriRuntime() && (
					<Row
						focusId="import-archive-rust"
						title="Import workspace (fast)"
						description="Import Skriuw archives with optimized Rust parser. Automatic duplicate detection."
					>
						<RustImportDialog />
					</Row>
				)}
			</SettingsCard>

			<GroupLabel>COVER IMAGE STORAGE</GroupLabel>
			<StorageConfigManager isSignedIn={isConnected} />
			<GroupLabel>COVER GALLERY</GroupLabel>
			<CoverGalleryManager isSignedIn={isConnected} />

			<GroupLabel>MAINTENANCE</GroupLabel>
			<SettingsCard>
				<NoteCleanupRow phase={cleanup.phase} onScan={cleanup.scan} disabled={false} />
			</SettingsCard>
			<NoteCleanupDialog
				result={cleanup.result}
				onOpenChange={(open) => {
					if (!open) cleanup.reset();
				}}
			/>

			{!isMobile && (
				<>
					<GroupLabel>EXTENSION & DESKTOP</GroupLabel>
					<DesktopSyncTokens isConnected={isConnected} />
				</>
			)}

			{isGuest && (
				<SettingsCard>
					<Row
						focusId="reset-demo-workspace"
						title="Reset demo workspace"
						description="Clear your local demo edits and restore the original seeded workspace. This cannot be undone."
					>
						<Button variant="outline" size="sm" onClick={handleResetDemo}>
							<RotateCcw className="size-3.5" />
							Reset demo
						</Button>
					</Row>
				</SettingsCard>
			)}

			<Dialog
				open={importDialogOpen}
				onOpenChange={(open) => {
					setImportDialogOpen(open);
					if (!open) resetImportFlow();
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Import backup</DialogTitle>
						<DialogDescription>
							{selectedFile
								? `Review what will happen when importing ${selectedFile.name}.`
								: "Select a ZIP archive to preview the import."}
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground">Source format</Label>
							<Select
								value={importProfile}
								onValueChange={(value) =>
									void handleImportProfileChange(value as "auto" | ImportProfile)
								}
								disabled={
									importState === "previewing" || importState === "importing"
								}
							>
								<SelectTrigger className="h-11 sm:h-8">
									<SelectValue placeholder="Auto-detect" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto-detect</SelectItem>
									<SelectItem value="skriuw">Skriuw backup</SelectItem>
									<SelectItem value="desktop-snapshot">
										Desktop snapshot (vault only)
									</SelectItem>
									<SelectItem value="obsidian">
										Obsidian vault (best effort)
									</SelectItem>
									<SelectItem value="apple-notes">
										Apple Notes HTML (best effort)
									</SelectItem>
									<SelectItem value="bear">Bear export (best effort)</SelectItem>
									<SelectItem value="notion">
										Notion export (best effort)
									</SelectItem>
									<SelectItem value="simplenote">
										Simplenote export (best effort)
									</SelectItem>
									<SelectItem value="markdown-vault">
										Markdown folder (best effort)
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground">Import policy</Label>
							<Select
								value={importPolicy}
								onValueChange={(value) =>
									void handleImportPolicyChange(value as ImportPolicy)
								}
								disabled={
									importState === "previewing" || importState === "importing"
								}
							>
								<SelectTrigger className="h-11 sm:h-8">
									<SelectValue placeholder="Merge" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="merge">Merge (skip duplicates)</SelectItem>
									<SelectItem value="overwrite">Overwrite matches</SelectItem>
									<SelectItem value="duplicate">Duplicate matches</SelectItem>
									<SelectItem value="replace-workspace">
										Replace workspace
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{importPolicy === "replace-workspace" && importPreview && (
						<div className="space-y-2">
							<Label
								htmlFor="replace-confirm"
								className="text-xs text-muted-foreground"
							>
								To confirm workspace replace, type{" "}
								<span className="font-mono text-foreground">{REPLACE_PHRASE}</span>
							</Label>
							<Input
								id="replace-confirm"
								value={replaceConfirm}
								onChange={(e) => setReplaceConfirm(e.target.value)}
								placeholder={REPLACE_PHRASE}
								autoComplete="off"
								maxLength={60}
							/>
						</div>
					)}

					{importState === "previewing" && (
						<p className="text-sm text-muted-foreground">Analyzing archive…</p>
					)}

					{importPreview && importState !== "previewing" && (
						<ImportPreviewSummary preview={importPreview} />
					)}

					{importState === "importing" && (
						<ImportProgress
							imported={importProgress.imported}
							total={importProgress.total}
						/>
					)}

					{importState === "success" && (
						<div className="space-y-3">
							<p className="text-sm text-foreground">
								Import completed successfully.
							</p>
							<div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
								<p className="text-xs text-muted-foreground">
									Imports often bring along empty or duplicate notes. Scan for
									them now?
								</p>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										setImportDialogOpen(false);
										resetImportFlow();
										void cleanup.scan();
									}}
								>
									Scan for junk notes
								</Button>
							</div>
						</div>
					)}

					{importError && (
						<p role="alert" className="text-sm text-destructive">
							{importError}
						</p>
					)}

					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" size="sm">
								Close
							</Button>
						</DialogClose>
						{importState === "ready" && importPreview && (
							<Button
								size="sm"
								disabled={
									!importHasWork(importPreview) ||
									(importPolicy === "replace-workspace" &&
										replaceConfirm.trim().toLowerCase() !== REPLACE_PHRASE)
								}
								onClick={handleConfirmImport}
							>
								{importPolicy === "replace-workspace"
									? "Replace workspace"
									: importPolicy === "overwrite"
										? "Import with overwrite"
										: importPolicy === "duplicate"
											? "Import as duplicates"
											: "Import new items"}
							</Button>
						)}
						{importState === "importing" && (
							<Button size="sm" disabled>
								Importing…
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<GroupLabel>DANGER ZONE</GroupLabel>
			<SettingsCard>
				<Row
					focusId="clear-all-data"
					title="Clear all data"
					description="Permanently delete all notes, folders, journal entries, and tags. Account and AI keys are kept."
				>
					<DeleteButton
						onDelete={handleClearData}
						label="Clear data"
						confirmLabel="Confirm clear"
						pendingLabel="Clearing"
						successLabel="Cleared"
						failedLabel="Retry"
						disabled={!isConnected}
					/>
				</Row>
			</SettingsCard>
		</>
	);
}
