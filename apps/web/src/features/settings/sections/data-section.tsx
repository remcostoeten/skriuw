"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, KeyRound, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { DeleteButton } from "@/shared/ui/delete-button";
import { GuestGate } from "@/shared/ui/guest-gate";
import { showUserToast } from "@/shared/lib/user-toast";
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
	DialogTrigger,
} from "@/shared/ui/dialog";
import {
	SectionHeader,
	Row,
	SettingsCard,
	GroupLabel,
} from "@/features/settings/components/settings-primitives";
import { settingsFocusDomId } from "@/features/settings/lib/settings-focus-anchor";
import { useAuth } from "@/core/auth/use-auth";
import { clearAllData } from "@/features/settings/actions/clear-data";
import { useNotesStore } from "@/features/notes/store";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { journalKeys } from "@/features/journal/hooks/journal-keys";
import type { ImportMergeResult, ImportPolicy, ImportPreview, ImportProfile } from "@/domain/data-transfer/types";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/ui/select";

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
		preview.notes.overwrite +
		preview.journalEntries.overwrite +
		preview.journalTags.overwrite;

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
					{preview.notes.overwrite > 0 ? ` · ${preview.notes.overwrite} to overwrite` : ""}
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
						<p className="mt-1">Create journal: {preview.samples.journalToCreate.join(", ")}</p>
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

function formatSyncTokenDate(value: string | null): string {
	if (!value) return "Never";
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function DesktopSyncTokens({ isConnected }: { isConnected: boolean }) {
	const [tokens, setTokens] = useState<SyncTokenSummary[]>([]);
	const [loadState, setLoadState] = useState<TokenLoadState>("idle");
	const [error, setError] = useState<string | null>(null);
	const [tokenName, setTokenName] = useState("Desktop app");
	const [createdToken, setCreatedToken] = useState<CreatedSyncToken | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const activeTokens = tokens.filter((token) => !token.revokedAt);

	async function loadTokens() {
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
	}

	useEffect(() => {
		void loadTokens();
	}, [isConnected]);

	async function createToken() {
		if (!isConnected || isCreating) return;
		setIsCreating(true);
		setError(null);
		setCopied(false);
		try {
			const response = await fetch("/api/sync/tokens", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: tokenName }),
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
			showUserToast("Desktop sync token created.", "success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not create desktop sync token.");
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
					token.id === tokenId ? { ...token, revokedAt: new Date().toISOString() } : token,
				),
			);
			if (createdToken?.id === tokenId) {
				setCreatedToken(null);
			}
			showUserToast("Desktop sync token revoked.", "success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not revoke desktop sync token.");
		} finally {
			setRevokingId(null);
		}
	}

	return (
		<SettingsCard>
			<div
				id={settingsFocusDomId("desktop-sync")}
				data-settings-focus="desktop-sync"
				className="py-4 scroll-mt-24"
			>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 text-sm font-medium">
							<KeyRound className="size-4 text-muted-foreground" />
							Desktop sync
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							Create a scoped token so the desktop app can pull your cloud workspace
							through <span className="font-mono text-foreground">/api/sync/export</span>.
						</p>
					</div>
					<div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-80">
						<Label htmlFor="desktop-sync-token-name" className="text-xs text-muted-foreground">
							Token name
						</Label>
						<div className="flex gap-2">
							<Input
								id="desktop-sync-token-name"
								value={tokenName}
								onChange={(event) => setTokenName(event.target.value)}
								disabled={!isConnected || isCreating}
								maxLength={80}
								placeholder="Desktop app"
							/>
							<Button
								size="sm"
								disabled={!isConnected || isCreating}
								onClick={createToken}
								title={!isConnected ? "Sign in to create a desktop sync token" : undefined}
							>
								<Plus className="size-3.5" />
								{isCreating ? "Creating…" : "Create"}
							</Button>
						</div>
					</div>
				</div>

				{createdToken && (
					<div className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div className="min-w-0 flex-1">
								<p className="text-xs font-medium text-foreground">
									Copy this token now. It will not be shown again.
								</p>
								<code className="mt-2 block overflow-x-auto rounded border border-border/60 bg-background px-3 py-2 text-xs text-foreground">
									{createdToken.token}
								</code>
							</div>
							<Button variant="outline" size="sm" onClick={copyCreatedToken}>
								{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
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
							Active tokens
						</p>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => void loadTokens()}
							disabled={!isConnected || loadState === "loading"}
						>
							{loadState === "loading" ? "Refreshing…" : "Refresh"}
						</Button>
					</div>

					{!isConnected && (
						<p className="text-sm text-muted-foreground">
							Sign in to create desktop sync tokens.
						</p>
					)}

					{isConnected && loadState === "loading" && tokens.length === 0 && (
						<p className="text-sm text-muted-foreground">Loading desktop sync tokens…</p>
					)}

					{isConnected && loadState !== "loading" && activeTokens.length === 0 && (
						<p className="text-sm text-muted-foreground">
							No active desktop sync tokens yet.
						</p>
					)}

					{activeTokens.length > 0 && (
						<div className="space-y-2">
							{activeTokens.map((token) => (
								<div
									key={token.id}
									className="flex flex-col gap-3 rounded-md border border-border/60 bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<p className="text-sm font-medium text-foreground">{token.name}</p>
											<span className="rounded border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
												{token.tokenPrefix}…
											</span>
										</div>
										<p className="mt-1 text-xs text-muted-foreground">
											Created {formatSyncTokenDate(token.createdAt)} · Last used{" "}
											{formatSyncTokenDate(token.lastUsedAt)}
										</p>
									</div>
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

function CloudDataSection() {
	const auth = useAuth();
	const isConnected = auth.phase === "authenticated";
	const isGuest = useIsGuestWorkspace();
	const queryClient = useQueryClient();
	const router = useRouter();
	const resetNotesStore = useNotesStore((s) => s.resetUi);

	const handleResetDemo = async () => {
		await resetGuestStorage();
		window.location.reload();
	};
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

	const uploadPreviewArchive = async (
		file: File,
		policy: ImportPolicy,
		profile: "auto" | ImportProfile,
	): Promise<ImportPreview> => {
		const formData = new FormData();
		formData.set("file", file);
		formData.set("policy", policy);
		if (profile !== "auto") {
			formData.set("profile", profile);
		}
		const response = await fetch("/api/data/import/preview", { method: "POST", body: formData });
		const body = (await response.json().catch(() => null)) as
			| ({ error?: string } & Partial<ImportPreview>)
			| null;
		if (!response.ok) {
			throw new Error(body?.error ?? "Import request failed.");
		}
		return body as ImportPreview;
	};

	const uploadImportArchive = async (
		file: File,
		policy: ImportPolicy,
		profile: "auto" | ImportProfile,
	): Promise<ImportMergeResult> => {
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
								title={!isConnected ? "Sign in to export" : undefined}
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
					description="Import a Skriuw backup or Markdown folder ZIP. Choose merge, overwrite, or full workspace replace."
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
								disabled={!isConnected || importState === "previewing" || importState === "importing"}
								onClick={() => fileInputRef.current?.click()}
								title={!isConnected ? "Sign in to import" : undefined}
							>
								<Upload className="size-3.5" />
								{importState === "previewing" ? "Reading…" : "Import"}
							</Button>
						</GuestGate>
					</>
				</Row>
			</SettingsCard>

			<GroupLabel>DESKTOP APP</GroupLabel>
			<DesktopSyncTokens isConnected={isConnected} />

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
								disabled={importState === "previewing" || importState === "importing"}
							>
								<SelectTrigger className="h-8">
									<SelectValue placeholder="Auto-detect" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto-detect</SelectItem>
									<SelectItem value="skriuw">Skriuw backup</SelectItem>
									<SelectItem value="obsidian">Obsidian vault (best effort)</SelectItem>
									<SelectItem value="apple-notes">Apple Notes HTML (best effort)</SelectItem>
									<SelectItem value="bear">Bear export (best effort)</SelectItem>
									<SelectItem value="notion">Notion export (best effort)</SelectItem>
									<SelectItem value="simplenote">Simplenote export (best effort)</SelectItem>
									<SelectItem value="markdown-vault">Markdown folder (best effort)</SelectItem>
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
								disabled={importState === "previewing" || importState === "importing"}
							>
								<SelectTrigger className="h-8">
									<SelectValue placeholder="Merge" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="merge">Merge (skip duplicates)</SelectItem>
									<SelectItem value="overwrite">Overwrite matches</SelectItem>
									<SelectItem value="duplicate">Duplicate matches</SelectItem>
									<SelectItem value="replace-workspace">Replace workspace</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{importPolicy === "replace-workspace" && importPreview && (
						<div className="space-y-2">
							<Label htmlFor="replace-confirm" className="text-xs text-muted-foreground">
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
						<p className="text-sm text-foreground">Import completed successfully.</p>
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
						disabledTitle={!isConnected ? "Sign in to clear data" : undefined}
					/>
				</Row>
			</SettingsCard>
		</>
	);
}
