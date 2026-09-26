"use client";
/* eslint-disable */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, domAnimation, LazyMotion, m, useReducedMotion } from "framer-motion";
import {
	AlertCircle,
	CalendarDays,
	CloudDownload,
	Cloud,
	CloudOff,
	Download,
	FileDown,
	FileText,
	FolderOpen,
	FolderTree,
	CheckCircle2,
	Loader2,
	LogIn,
	RefreshCw,
	Rocket,
	RotateCcw,
	Tag,
	Upload,
} from "lucide-react";
import { EASE_OUT_QUART, pickTransition } from "@/shared/lib/motion";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import {
	GroupLabel,
	Row,
	SectionHeader,
	SettingsCard,
} from "@/features/settings/components/settings-primitives";
import { settingsFocusDomId } from "@/features/settings/lib/settings-focus-anchor";
import { NoteCleanupDialog, NoteCleanupRow } from "@/features/settings/components/note-cleanup";
import { useNoteCleanupScan } from "@/features/settings/lib/use-note-cleanup-scan";
import { tauriChannel, tauriInvoke, useWorkspaceBackend } from "@/core/workspace-backend";
import {
	importSimplenoteFile,
	organizeWorkspaceNotesByYear,
	previewSimplenoteFile,
	type SimplenoteDuplicatePolicy,
	type SimplenoteImportPreview,
	type SimplenoteOrganizationMode,
} from "@/features/settings/lib/import-simplenote-vault";
import {
	applyImportTitleSuggestion,
	createImportTitleSuggestions,
	isImportTitleCandidate,
	type ImportTitleFailure,
	type ImportTitleProgress,
	type ImportTitleSuggestion,
} from "@/features/settings/lib/import-ai-titles";
import { callAi } from "@/features/ai/service";
import type { NoteFile } from "@/domain/notes/models";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { journalKeys } from "@/features/journal/hooks/journal-keys";
import { pullWorkspaceFromServer, type PullResult } from "@/domain/sync/pull-workspace";
import {
	clearSyncClientConfig,
	getSyncClientConfig,
	setSyncClientConfig,
} from "@/domain/sync/sync-client-config";
import { syncDesktopWorkspace } from "@/domain/sync/sync-workspace";
import {
	beginDesktopPairing,
	finishDesktopPairing,
	openDesktopPairingPage,
	revokeDesktopCredential,
	type DesktopPairingRequest,
} from "@/domain/sync/device-pairing";
import type { SyncClientConfig } from "@/domain/sync/sync-client-config";
import { getBrowserAppOrigin } from "@/lib/app-origin";
import { matchesDesktopResetPhrase, RESET_PHRASE } from "@/features/settings/lib/desktop-reset";

type Busy =
	| "idle"
	| "export"
	| "import"
	| "clear"
	| "pull"
	| "push"
	| "sync"
	| "pair"
	| "simplenote"
	| "snapshot"
	| "reset"
	| "organize";
type AiTitleStage = "idle" | "generating" | "review";
type SnapshotState = "idle" | "working" | "success" | "error";
type SnapshotEvent =
	| { type: "status"; message: string }
	| { type: "progress"; completed: number; total: number; percent: number }
	| { type: "done"; path: string };

type DesktopUpdateStatus = {
	configured: boolean;
	currentVersion: string;
	availableVersion: string | null;
	notes: string | null;
	publishedAt: string | null;
	state: "idle" | "checking" | "available" | "current" | "installing";
	message: string;
};

type VaultWatcherStatus = {
	state: "active" | "rescanning" | "degraded" | "stopped";
	root: string | null;
	message: string | null;
};

/**
 * Human-readable message for a caught error. Tauri commands reject with plain
 * strings rather than Error instances, so both shapes must surface their
 * message instead of the generic fallback.
 */
function describeError(error: unknown, fallback: string): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string" && error.trim()) return error;
	return fallback;
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

function formatAiTitleEta(progress: ImportTitleProgress | null): string | null {
	if (!progress || progress.completed === 0 || progress.completed >= progress.total) return null;
	const elapsedSeconds = Math.max((Date.now() - progress.startedAt) / 1000, 1);
	const secondsPerNote = elapsedSeconds / progress.completed;
	const remainingSeconds = Math.ceil((progress.total - progress.completed) * secondsPerNote);
	if (remainingSeconds < 60) return `${remainingSeconds}s remaining`;
	return `${Math.ceil(remainingSeconds / 60)}m remaining`;
}

function formatSnapshotEta(
	progress: { completed: number; total: number } | null,
	startedAt: number | null,
) {
	if (
		!progress ||
		!startedAt ||
		progress.completed === 0 ||
		progress.completed >= progress.total
	) {
		return null;
	}
	const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1);
	const secondsPerUnit = elapsedSeconds / progress.completed;
	const remainingSeconds = Math.ceil((progress.total - progress.completed) * secondsPerUnit);
	if (remainingSeconds < 60) return `${remainingSeconds}s remaining`;
	return `${Math.ceil(remainingSeconds / 60)}m remaining`;
}

type PullPhase = "idle" | "pulling" | "success" | "error";

const PULL_BUTTON_LABEL: Record<PullPhase, string> = {
	idle: "Pull now",
	pulling: "Pulling…",
	success: "Pulled",
	error: "Retry",
};

function PullButtonIcon({ phase }: { phase: PullPhase }) {
	if (phase === "pulling") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
	if (phase === "success") return <CheckCircle2 className="h-3.5 w-3.5" />;
	if (phase === "error") return <AlertCircle className="h-3.5 w-3.5" />;
	return <CloudDownload className="h-3.5 w-3.5" />;
}

/**
 * Pull trigger whose contents morph between idle / pulling / success / error.
 * The label swaps with a short blur-fade slide (masking the crossfade so the
 * eye reads one morph, not two overlapping words), the background tints by
 * outcome via the button's own colour transition, and `:active` scales it for
 * press feedback. Settling back to idle is driven by the parent's flash timer.
 */
function PullButton({
	phase,
	disabled,
	reduceMotion,
	onClick,
}: {
	phase: PullPhase;
	disabled: boolean;
	reduceMotion: boolean;
	onClick: () => void;
}) {
	const swap = pickTransition(reduceMotion, {
		duration: 0.18,
		ease: EASE_OUT_QUART,
	});
	return (
		<Button
			size="sm"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"relative min-w-[116px] justify-center overflow-hidden transition-[transform,background-color,border-color,color] duration-200 active:scale-[0.97]",
				phase === "success" &&
					"border-emerald-500/40 bg-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-100",
				phase === "error" &&
					"border-destructive/40 bg-destructive text-destructive-foreground hover:bg-destructive",
			)}
		>
			<AnimatePresence mode="popLayout" initial={false}>
				<m.span
					key={phase}
					className="inline-flex items-center gap-1.5"
					initial={
						reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(4px)" }
					}
					animate={
						reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }
					}
					exit={
						reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(4px)" }
					}
					transition={swap}
				>
					<PullButtonIcon phase={phase} />
					{PULL_BUTTON_LABEL[phase]}
				</m.span>
			</AnimatePresence>
		</Button>
	);
}

function SyncResultRow({
	icon,
	count,
	label,
	reduceMotion,
}: {
	icon: React.ReactNode;
	count: number;
	label: string;
	reduceMotion: boolean;
}) {
	return (
		<m.div
			className="flex items-center gap-2 text-xs"
			variants={{
				hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 },
				show: { opacity: 1, y: 0 },
			}}
		>
			<span className="text-muted-foreground">{icon}</span>
			<span className="min-w-[2ch] text-right font-medium tabular-nums text-foreground">
				{count}
			</span>
			<span className="text-muted-foreground">{label}</span>
		</m.div>
	);
}

/**
 * Post-pull receipt: what landed and where it was written. Rows stagger in so
 * the breakdown reads top-to-bottom rather than flashing all at once.
 */
function SyncResultPanel({
	result,
	origin,
	vaultRoot,
	reduceMotion,
}: {
	result: PullResult;
	origin: string;
	vaultRoot: string;
	reduceMotion: boolean;
}) {
	const rowTransition = pickTransition(reduceMotion, {
		duration: 0.22,
		ease: EASE_OUT_QUART,
	});
	return (
		<m.div
			className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3"
			initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
			transition={pickTransition(reduceMotion, {
				duration: 0.24,
				ease: EASE_OUT_QUART,
			})}
			aria-live="polite"
		>
			<div className="flex items-center gap-2">
				<CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
				<p className="text-sm font-medium text-foreground">
					Synced from{" "}
					<span className="break-all font-mono text-foreground/90">{origin}</span>
				</p>
			</div>

			<m.div
				className="grid grid-cols-2 gap-x-6 gap-y-1.5 pl-6"
				initial="hidden"
				animate="show"
				variants={{
					hidden: {},
					show: {
						transition: {
							staggerChildren: reduceMotion ? 0 : 0.05,
							delayChildren: reduceMotion ? 0 : 0.04,
						},
					},
				}}
			>
				<SyncResultRow
					icon={<FileText className="h-3.5 w-3.5" />}
					count={result.notes}
					label={result.notes === 1 ? "note" : "notes"}
					reduceMotion={reduceMotion}
				/>
				<SyncResultRow
					icon={<FolderTree className="h-3.5 w-3.5" />}
					count={result.folders}
					label={result.folders === 1 ? "folder" : "folders"}
					reduceMotion={reduceMotion}
				/>
				<SyncResultRow
					icon={<CalendarDays className="h-3.5 w-3.5" />}
					count={result.journalEntries}
					label={result.journalEntries === 1 ? "journal entry" : "journal entries"}
					reduceMotion={reduceMotion}
				/>
				<SyncResultRow
					icon={<Tag className="h-3.5 w-3.5" />}
					count={result.journalTags}
					label={result.journalTags === 1 ? "new tag" : "new tags"}
					reduceMotion={reduceMotion}
				/>
			</m.div>

			{vaultRoot ? (
				<m.div
					className="flex items-start gap-2 border-t border-emerald-500/20 pt-2.5"
					initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ ...rowTransition, delay: reduceMotion ? 0 : 0.26 }}
				>
					<FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<p className="min-w-0 text-xs text-muted-foreground">
						Saved to your vault at{" "}
						<span className="break-all font-mono text-foreground/90">{vaultRoot}</span>
					</p>
				</m.div>
			) : null}
		</m.div>
	);
}

/**
 * Desktop ("tauri" mode) replacement for the cloud Data & sync section. Every
 * action is local: the markdown vault is the source of truth, so backup is a
 * portable .zip of it and restore/clear rebuild the SQLite index from disk.
 */
async function handleReveal() {
	await tauriInvoke<void>("reveal_vault").catch(() => undefined);
}

export function LocalDataSection() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();
	const [vaultRoot, setVaultRoot] = useState<string>("");
	const [coverAssetsRoot, setCoverAssetsRoot] = useState<string>("");
	const [busy, setBusy] = useState<Busy>("idle");
	const [notice, setNotice] = useState<string | null>(null);
	const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus | null>(null);
	const [updateBusy, setUpdateBusy] = useState<"idle" | "checking" | "installing">("idle");
	const [watcherStatus, setWatcherStatus] = useState<VaultWatcherStatus | null>(null);
	const [watcherBusy, setWatcherBusy] = useState(false);
	const [serverUrl, setServerUrl] = useState<string>(
		() => getBrowserAppOrigin() ?? "https://skriuw.com",
	);
	const [token, setToken] = useState<string>("");
	const [syncEnabled, setSyncEnabled] = useState(false);
	const [syncAccount, setSyncAccount] = useState<SyncClientConfig["account"]>();
	const [pairing, setPairing] = useState<DesktopPairingRequest | null>(null);
	const pairingAbortRef = useRef<AbortController | null>(null);
	const [pullError, setPullError] = useState<string | null>(null);
	const [pullResult, setPullResult] = useState<{
		result: PullResult;
		origin: string;
		at: number;
	} | null>(null);
	const [pullFlash, setPullFlash] = useState<"success" | "error" | null>(null);
	const pullFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const prefersReducedMotion = useReducedMotion() ?? false;
	const [simplenoteFile, setSimplenoteFile] = useState<File | null>(null);
	const [simplenotePreview, setSimplenotePreview] = useState<SimplenoteImportPreview | null>(
		null,
	);
	const [simplenotePolicy, setSimplenotePolicy] = useState<SimplenoteDuplicatePolicy>("skip");
	const [simplenoteOrganization, setSimplenoteOrganization] =
		useState<SimplenoteOrganizationMode>("root");
	const [simplenoteDialogOpen, setSimplenoteDialogOpen] = useState(false);
	const [simplenoteProgress, setSimplenoteProgress] = useState({
		imported: 0,
		total: 0,
	});
	const [generateAiTitles, setGenerateAiTitles] = useState(true);
	const [aiTitleStage, setAiTitleStage] = useState<AiTitleStage>("idle");
	const [aiTitleProgress, setAiTitleProgress] = useState<ImportTitleProgress | null>(null);
	const [aiTitleSuggestions, setAiTitleSuggestions] = useState<ImportTitleSuggestion[]>([]);
	const [aiTitleFailures, setAiTitleFailures] = useState<ImportTitleFailure[]>([]);
	const aiTitleNotesRef = useRef<NoteFile[]>([]);
	const [selectedAiTitleIds, setSelectedAiTitleIds] = useState<Set<string>>(new Set());
	const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
	const [snapshotProgress, setSnapshotProgress] = useState<{
		completed: number;
		total: number;
		percent: number;
	} | null>(null);
	const [snapshotStartedAt, setSnapshotStartedAt] = useState<number | null>(null);
	const [snapshotMode, setSnapshotMode] = useState<"export" | "import" | null>(null);
	const [snapshotState, setSnapshotState] = useState<SnapshotState>("idle");
	const [snapshotResult, setSnapshotResult] = useState<string | null>(null);
	const [resetDialogOpen, setResetDialogOpen] = useState(false);
	const [resetConfirm, setResetConfirm] = useState("");
	const [removeAiKeys, setRemoveAiKeys] = useState(false);
	const [resetStatus, setResetStatus] = useState<string | null>(null);
	const [resetProgress, setResetProgress] = useState<{
		completed: number;
		total: number;
		percent: number;
	} | null>(null);
	const [resetStartedAt, setResetStartedAt] = useState<number | null>(null);
	const [resetState, setResetState] = useState<SnapshotState>("idle");
	const cleanup = useNoteCleanupScan();
	const [cleanupPrompt, setCleanupPrompt] = useState(false);
	const simplenoteInputRef = useRef<HTMLInputElement>(null);

	function resetSimplenoteFlow() {
		setSimplenoteFile(null);
		setSimplenotePreview(null);
		setSimplenoteOrganization("root");
		setSimplenoteProgress({ imported: 0, total: 0 });
		setAiTitleStage("idle");
		setAiTitleProgress(null);
		setAiTitleSuggestions([]);
		setAiTitleFailures([]);
		aiTitleNotesRef.current = [];
		setSelectedAiTitleIds(new Set());
	}

	function resetDesktopResetFlow() {
		setResetConfirm("");
		setRemoveAiKeys(false);
		setResetStatus(null);
		setResetProgress(null);
		setResetStartedAt(null);
		setResetState("idle");
	}

	useEffect(() => {
		tauriInvoke<string>("get_vault_root")
			.then(setVaultRoot)
			.catch(() => setVaultRoot(""));
		tauriInvoke<string>("get_cover_assets_root")
			.then(setCoverAssetsRoot)
			.catch(() => setCoverAssetsRoot(""));
		tauriInvoke<{
			path: string;
			recoveryError: string | null;
		}>("get_settings_diagnostics")
			.then((diagnostics) => {
				if (diagnostics.recoveryError) {
					setNotice(
						`Settings are read-only because ${diagnostics.path} could not be parsed. ${diagnostics.recoveryError}`,
					);
				}
			})
			.catch(() => undefined);
		tauriInvoke<DesktopUpdateStatus>("desktop_update_status")
			.then(setUpdateStatus)
			.catch(() => setUpdateStatus(null));
		tauriInvoke<VaultWatcherStatus>("vault_watcher_status")
			.then(setWatcherStatus)
			.catch(() => setWatcherStatus(null));
	}, []);

	const runWatcherAction = async (command: "rescan_vault" | "restart_vault_watcher") => {
		setWatcherBusy(true);
		try {
			await tauriInvoke<void>(command);
			setWatcherStatus(await tauriInvoke<VaultWatcherStatus>("vault_watcher_status"));
			setNotice(
				command === "rescan_vault" ? "Vault rescan complete." : "Vault watcher restarted.",
			);
		} catch (error) {
			setNotice(describeError(error, "Vault watcher recovery failed."));
		} finally {
			setWatcherBusy(false);
		}
	};

	const handleCheckUpdate = async () => {
		setUpdateBusy("checking");
		try {
			setUpdateStatus(await tauriInvoke<DesktopUpdateStatus>("desktop_check_update"));
		} catch (error) {
			setNotice(describeError(error, "Could not check for updates."));
		} finally {
			setUpdateBusy("idle");
		}
	};

	const handleInstallUpdate = async () => {
		if (!window.confirm("Install the signed update now? Skriuw may restart to finish.")) return;
		setUpdateBusy("installing");
		try {
			setUpdateStatus(await tauriInvoke<DesktopUpdateStatus>("desktop_install_update"));
		} catch (error) {
			setNotice(describeError(error, "Could not install the update."));
			setUpdateBusy("idle");
		}
	};

	useEffect(() => {
		void getSyncClientConfig()
			.then((config) => {
				if (!config) return;
				setServerUrl(config.serverUrl);
				setToken(config.token);
				setSyncEnabled(config.enabled);
				setSyncAccount(config.account);
			})
			.catch((error) => {
				setPullError(describeError(error, "The secure credential store is unavailable."));
			});
	}, []);

	useEffect(() => {
		return () => {
			if (pullFlashTimer.current) clearTimeout(pullFlashTimer.current);
			pairingAbortRef.current?.abort();
		};
	}, []);

	const handleConnectAccount = async () => {
		setBusy("pair");
		setPullError(null);
		const controller = new AbortController();
		pairingAbortRef.current = controller;
		try {
			const request = await beginDesktopPairing(serverUrl);
			setPairing(request);
			await openDesktopPairingPage(request.verificationUrl);
			const result = await finishDesktopPairing(request, controller.signal);
			await setSyncClientConfig({
				serverUrl: request.serverUrl,
				token: result.token,
				enabled: false,
				account: result.account,
			});
			setToken(result.token);
			setServerUrl(request.serverUrl);
			setSyncAccount(result.account);
			setSyncEnabled(false);
			setNotice(`Connected as ${result.account.email}. Cloud sync is still off.`);
		} catch (error) {
			if (!(error instanceof DOMException && error.name === "AbortError")) {
				setPullError(describeError(error, "Desktop sign-in failed."));
			}
		} finally {
			pairingAbortRef.current = null;
			setPairing(null);
			setBusy("idle");
		}
	};

	const cancelPairing = () => {
		pairingAbortRef.current?.abort();
		setPairing(null);
		setBusy("idle");
	};

	const handlePull = async () => {
		const url = serverUrl.trim();
		const tok = token.trim();
		if (!url || !tok) {
			flashPull("error");
			setPullError("Enter your server URL and a sync token first.");
			return;
		}
		setBusy("pull");
		setPullError(null);
		try {
			const result = await pullWorkspaceFromServer(backend, url, tok);
			await setSyncClientConfig({ serverUrl: url, token: tok, enabled: false });
			await queryClient.invalidateQueries({ queryKey: notesKeys.all });
			await queryClient.invalidateQueries({ queryKey: journalKeys.all });
			setPullResult({ result, origin: url, at: Date.now() });
			flashPull("success");
		} catch (error) {
			setPullError(describeError(error, "Sync failed."));
			flashPull("error");
		} finally {
			setBusy("idle");
		}
	};

	const handleSync = async () => {
		const url = serverUrl.trim();
		const tok = token.trim();
		if (!url || !tok) {
			setPullError("Reconnect your Skriuw account before enabling sync.");
			return;
		}
		const previous = await getSyncClientConfig();
		if (!syncEnabled) {
			const accepted = window.confirm(
				"Enable cloud sync? Notes, journal entries, folders, tags, and future changes will be sent to your Skriuw server. Your local vault remains the source of truth and you can disable sync at any time.",
			);
			if (!accepted) return;
		}
		setBusy("sync");
		setPullError(null);
		try {
			const config = {
				serverUrl: url,
				token: tok,
				enabled: true,
				lastSyncedAt: previous?.lastSyncedAt,
				lastSnapshotIds: previous?.lastSnapshotIds,
				account: syncAccount,
			};
			const result = await syncDesktopWorkspace(backend, config);
			setSyncEnabled(true);
			await queryClient.invalidateQueries({ queryKey: notesKeys.all });
			await queryClient.invalidateQueries({ queryKey: journalKeys.all });
			setPullResult({ result: result.pull, origin: url, at: Date.now() });
			setNotice(
				result.push.conflicts > 0
					? `Synced with ${result.push.conflicts} conflict ${result.push.conflicts === 1 ? "copy" : "copies"} preserved.`
					: "Cloud sync completed.",
			);
		} catch (error) {
			setPullError(describeError(error, "Cloud sync failed."));
		} finally {
			setBusy("idle");
		}
	};

	const handleDisableSync = async () => {
		const existing = await getSyncClientConfig();
		if (existing) await setSyncClientConfig({ ...existing, enabled: false });
		setSyncEnabled(false);
		setPullResult(null);
		setNotice(
			"Cloud sync turned off. Your account stays connected and local files were not deleted.",
		);
	};

	const handleDisconnectAccount = async () => {
		setBusy("pair");
		await revokeDesktopCredential(serverUrl, token);
		await clearSyncClientConfig();
		setSyncEnabled(false);
		setSyncAccount(undefined);
		setToken("");
		setPullResult(null);
		setBusy("idle");
		setNotice("Desktop disconnected. Local files and cloud data were not deleted.");
	};

	function flashPull(kind: "success" | "error") {
		if (pullFlashTimer.current) clearTimeout(pullFlashTimer.current);
		setPullFlash(kind);
		pullFlashTimer.current = setTimeout(() => setPullFlash(null), 2000);
	}

	async function refreshWorkspace() {
		await queryClient.invalidateQueries({ queryKey: notesKeys.all });
	}

	const handleExport = async () => {
		setBusy("export");
		setNotice(null);
		try {
			const out = await tauriInvoke<string | null>("export_vault");
			setNotice(out ? `Backed up to ${out}` : null);
		} catch (error) {
			setNotice(describeError(error, "Backup failed."));
		} finally {
			setBusy("idle");
		}
	};

	const handleImport = async () => {
		setBusy("import");
		setNotice(null);
		try {
			// Rust stages and validates the backup before it touches the live
			// vault, forwarding each phase (inspecting → staging → swapping →
			// rebuilding → verifying) so the notice reflects real progress.
			const progress = tauriChannel<SnapshotEvent>((event) => {
				if (event.type === "status") setNotice(`${event.message}…`);
			});
			const restored = await tauriInvoke<boolean>("import_vault", { progress });
			if (restored) {
				await refreshWorkspace();
				setNotice("Vault restored from backup.");
				setCleanupPrompt(true);
			} else {
				setNotice(null);
			}
		} catch (error) {
			setNotice(describeError(error, "Restore failed."));
		} finally {
			setBusy("idle");
		}
	};

	const handleSnapshotExport = async () => {
		setBusy("snapshot");
		setSnapshotMode("export");
		setSnapshotState("working");
		setSnapshotResult(null);
		setNotice(null);
		setSnapshotStartedAt(null);
		setSnapshotStatus("Preparing snapshot");
		setSnapshotProgress({ completed: 0, total: 0, percent: 0 });
		try {
			const progress = tauriChannel<SnapshotEvent>((event) => {
				if (event.type === "status") {
					setSnapshotStatus(event.message);
					return;
				}
				if (event.type === "progress") {
					setSnapshotStartedAt((started) => started ?? Date.now());
					setSnapshotProgress(event);
					return;
				}
				setSnapshotState("success");
				setSnapshotResult(event.path);
				setSnapshotStatus("Snapshot saved");
			});
			const out = await tauriInvoke<string | null>("export_snapshot", {
				progress,
			});
			setNotice(out ? `Snapshot saved to ${out}` : null);
		} catch (error) {
			setSnapshotState("error");
			setNotice(describeError(error, "Snapshot export failed."));
		} finally {
			setBusy("idle");
			setSnapshotMode(null);
		}
	};

	const handleSnapshotImport = async () => {
		const accepted = window.confirm(
			"Restoring a full snapshot replaces this device's entire workspace — every note, " +
				"folder, journal entry, setting, and local AI model — with the snapshot's contents. " +
				"Your current data is moved aside first and can be recovered if the restore fails. Continue?",
		);
		if (!accepted) return;
		setBusy("snapshot");
		setSnapshotMode("import");
		setSnapshotState("working");
		setSnapshotResult(null);
		setNotice("Restoring snapshot and reloading Skriuw…");
		setSnapshotStatus("Restoring snapshot");
		setSnapshotProgress(null);
		try {
			const progress = tauriChannel<SnapshotEvent>((event) => {
				if (event.type === "status") {
					setSnapshotStatus(event.message);
				}
			});
			await tauriInvoke<void>("import_snapshot", { progress });
			window.location.reload();
		} catch (error) {
			setSnapshotState("error");
			setNotice(describeError(error, "Snapshot restore failed."));
			setBusy("idle");
			setSnapshotMode(null);
		}
	};

	async function handleSimplenoteImport(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setSimplenoteFile(file);
		setSimplenoteDialogOpen(true);
		setBusy("simplenote");
		setNotice(null);
		setSimplenotePreview(null);
		setSimplenoteProgress({ imported: 0, total: 0 });
		setAiTitleStage("idle");
		setAiTitleProgress(null);
		setAiTitleSuggestions([]);
		setAiTitleFailures([]);
		aiTitleNotesRef.current = [];
		setSelectedAiTitleIds(new Set());
		try {
			setSimplenotePreview(await previewSimplenoteFile(file, backend));
		} catch (error) {
			setNotice(describeError(error, "Simplenote import failed."));
			setSimplenoteDialogOpen(false);
		} finally {
			setBusy("idle");
		}
	}

	async function confirmSimplenoteImport() {
		if (!simplenoteFile) return;
		setBusy("simplenote");
		setNotice(null);
		setSimplenoteProgress({
			imported: 0,
			total: simplenotePreview?.total ?? 0,
		});
		setAiTitleStage("idle");
		setAiTitleProgress(null);
		setAiTitleSuggestions([]);
		setAiTitleFailures([]);
		aiTitleNotesRef.current = [];
		setSelectedAiTitleIds(new Set());
		try {
			const summary = await importSimplenoteFile(simplenoteFile, backend, {
				duplicatePolicy: simplenotePolicy,
				organizationMode: simplenoteOrganization,
				onProgress: (imported, total) => setSimplenoteProgress({ imported, total }),
			});
			await refreshWorkspace();
			setCleanupPrompt(true);
			const parts = [`Imported ${summary.imported} notes from Simplenote`];
			if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`);
			if (summary.overwritten > 0) parts.push(`${summary.overwritten} overwritten`);
			if (summary.duplicated > 0) parts.push(`${summary.duplicated} duplicated`);
			if (summary.organizedByYear > 0)
				parts.push(`${summary.organizedByYear} organized by year`);
			if (summary.trashed > 0) parts.push(`${summary.trashed} sent to Trash`);
			setNotice(`${parts[0]}${parts.length > 1 ? ` (${parts.slice(1).join(", ")})` : ""}.`);
			const titleCandidates = summary.importedNotes.filter(isImportTitleCandidate);
			if (generateAiTitles && titleCandidates.length > 0) {
				setAiTitleStage("generating");
				aiTitleNotesRef.current = summary.importedNotes;
				const result = await createImportTitleSuggestions(summary.importedNotes, {
					concurrency: 3,
					generateTitle: (content) => callAi("generateTitle", content),
					onProgress: setAiTitleProgress,
				});
				setAiTitleSuggestions(result.suggestions);
				setAiTitleFailures(result.failures);
				setSelectedAiTitleIds(
					new Set(result.suggestions.map((suggestion) => suggestion.noteId)),
				);
				setAiTitleStage("review");
				setNotice(
					`${parts[0]}${parts.length > 1 ? ` (${parts.slice(1).join(", ")})` : ""}. Generated ${result.succeeded} title suggestions.`,
				);
			} else {
				setSimplenoteDialogOpen(false);
				resetSimplenoteFlow();
			}
		} catch (error) {
			setNotice(describeError(error, "Simplenote import failed."));
		} finally {
			setBusy("idle");
		}
	}

	async function applyAiTitleSuggestions() {
		const selected = aiTitleSuggestions.filter((suggestion) =>
			selectedAiTitleIds.has(suggestion.noteId),
		);
		if (selected.length === 0) {
			discardAiTitleSuggestions();
			return;
		}
		setBusy("simplenote");
		try {
			const notesById = new Map(aiTitleNotesRef.current.map((note) => [note.id, note]));
			const applied = (
				await Promise.all(
					selected.map(async (suggestion) => {
						const note = notesById.get(suggestion.noteId);
						if (!note) return 0;
						const next = applyImportTitleSuggestion(note, suggestion.title);
						const result = await backend.updateNote({
							id: next.id,
							name: next.name,
							content: next.content,
							richContent: next.richContent,
							preferredEditorMode: next.preferredEditorMode,
							parentId: next.parentId,
							sortOrder: next.sortOrder,
							tags: next.tags,
							trackHeading: false,
						});
						return result.note ? 1 : 0;
					}),
				)
			).reduce((total, count) => total + count, 0 as number);
			await refreshWorkspace();
			setNotice(`Applied ${applied} AI-generated titles.`);
			setSimplenoteDialogOpen(false);
			resetSimplenoteFlow();
		} catch (error) {
			setNotice(describeError(error, "Applying AI titles failed."));
		} finally {
			setBusy("idle");
		}
	}

	function discardAiTitleSuggestions() {
		setNotice("Discarded AI-generated title suggestions.");
		setSimplenoteDialogOpen(false);
		resetSimplenoteFlow();
	}

	async function handleOrganizeByYear() {
		setBusy("organize");
		setNotice(null);
		try {
			const result = await organizeWorkspaceNotesByYear(backend);
			await refreshWorkspace();
			setNotice(
				result.moved > 0
					? `Moved ${result.moved} notes into ${result.folders} year folders.`
					: "No root notes with creation dates needed moving.",
			);
		} catch (error) {
			setNotice(describeError(error, "Organizing notes failed."));
		} finally {
			setBusy("idle");
		}
	}

	const handleResetApp = async () => {
		setBusy("reset");
		setResetState("working");
		setResetStatus("Resetting desktop data");
		setResetProgress({ completed: 0, total: 0, percent: 0 });
		setResetStartedAt(null);
		setNotice(null);
		let resetSucceeded = false;
		try {
			const progress = tauriChannel<SnapshotEvent>((event) => {
				if (event.type === "status") {
					setResetStatus(event.message);
					return;
				}
				if (event.type === "progress") {
					setResetStartedAt((started) => started ?? Date.now());
					setResetProgress(event);
					return;
				}
				resetSucceeded = true;
				setResetState("success");
				setResetProgress((current) => current ?? { completed: 0, total: 0, percent: 100 });
				setResetStatus("Desktop data cleared. Reloading Skriuw…");
			});
			// OS-stored AI keys live outside the app-data directories a reset
			// wipes, so they are only removed when the user explicitly opts in.
			// If that removal fails (locked/unavailable keychain), abort BEFORE
			// wiping anything — otherwise the reset would report success while
			// the keys survive on the machine.
			if (removeAiKeys) {
				try {
					await tauriInvoke<void>("ai_clear_credentials");
				} catch (error) {
					setResetState("error");
					setNotice(
						`Couldn't remove your saved AI keys: ${describeError(error, "keychain error")}. Unlock your keychain and try again, or uncheck that option.`,
					);
					return;
				}
			}
			try {
				await clearSyncClientConfig();
			} catch (error) {
				setResetState("error");
				setNotice(
					`Couldn't remove your desktop sync credential: ${describeError(error, "keychain error")}. Unlock your keychain and try again.`,
				);
				return;
			}
			await tauriInvoke<void>("reset_desktop_data", { progress });
			window.location.reload();
		} catch (error) {
			if (resetSucceeded) return;
			setResetState("error");
			setNotice(describeError(error, "Reset failed."));
		} finally {
			setBusy("idle");
		}
	};

	const snapshotEta = formatSnapshotEta(snapshotProgress, snapshotStartedAt);
	const resetEta = formatSnapshotEta(resetProgress, resetStartedAt);
	const resetMatches = matchesDesktopResetPhrase(resetConfirm);

	const handleChangeDirectory = async () => {
		const next = await tauriInvoke<string | null>("choose_vault_root");
		if (next) {
			setVaultRoot(next);
			setWatcherStatus(await tauriInvoke<VaultWatcherStatus>("vault_watcher_status"));
			setNotice("Vault directory updated and loaded.");
		}
	};

	const handleRevealCoverAssets = async () => {
		await tauriInvoke<void>("reveal_cover_assets").catch(() => undefined);
	};

	const handleChangeCoverAssetsDirectory = async () => {
		const next = await tauriInvoke<string | null>("choose_cover_assets_root");
		if (next) {
			setCoverAssetsRoot(next);
			setNotice("Cover image storage location updated.");
		}
	};

	const handleResetCoverAssetsDirectory = async () => {
		const next = await tauriInvoke<string>("reset_cover_assets_root");
		setCoverAssetsRoot(next);
		setNotice("Cover image storage location reset to default.");
	};

	return (
		<LazyMotion features={domAnimation} strict>
			<div>
				<SectionHeader
					title="Data"
					description="Your notes live as plain markdown on this device. Back them up, restore, or move the vault anytime."
				/>

				<GroupLabel>Vault</GroupLabel>
				<SettingsCard>
					<Row
						focusId="local-vault-directory"
						title="Vault directory"
						description={vaultRoot || "Loading…"}
					>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={handleReveal}>
								<FolderOpen className="mr-1.5 h-3.5 w-3.5" />
								Open
							</Button>
							<Button variant="outline" size="sm" onClick={handleChangeDirectory}>
								Change…
							</Button>
						</div>
					</Row>
					<Row
						focusId="local-vault-watcher"
						title={`Live vault watching · ${watcherStatus?.state ?? "loading"}`}
						description={
							watcherStatus?.message ??
							"Changes made by other Markdown editors appear automatically."
						}
					>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={watcherBusy}
								onClick={() => void runWatcherAction("rescan_vault")}
							>
								<RefreshCw
									className={cn("mr-1.5 size-3.5", watcherBusy && "animate-spin")}
								/>
								Rescan now
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={watcherBusy}
								onClick={() => void runWatcherAction("restart_vault_watcher")}
							>
								Restart watcher
							</Button>
						</div>
					</Row>
					<Row
						focusId="local-cover-assets-directory"
						title="Cover image storage"
						description={coverAssetsRoot || "Loading…"}
					>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={handleRevealCoverAssets}>
								<FolderOpen className="mr-1.5 h-3.5 w-3.5" />
								Open
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={handleChangeCoverAssetsDirectory}
							>
								Change…
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={handleResetCoverAssetsDirectory}
							>
								Reset
							</Button>
						</div>
					</Row>
				</SettingsCard>

				<GroupLabel>App updates</GroupLabel>
				<SettingsCard>
					<Row
						focusId="desktop-app-update"
						title={
							updateStatus?.availableVersion
								? `Skriuw ${updateStatus.availableVersion} available`
								: `Skriuw ${updateStatus?.currentVersion ?? ""}`.trim()
						}
						description={
							updateStatus?.message ?? "Loading signed-update configuration…"
						}
					>
						<div className="flex gap-2">
							{updateStatus?.availableVersion ? (
								<Button
									size="sm"
									disabled={updateBusy !== "idle"}
									onClick={() => void handleInstallUpdate()}
								>
									{updateBusy === "installing" ? (
										<Loader2 className="mr-1.5 size-3.5 animate-spin" />
									) : (
										<Rocket className="mr-1.5 size-3.5" />
									)}
									Install update
								</Button>
							) : null}
							<Button
								variant="outline"
								size="sm"
								disabled={!updateStatus?.configured || updateBusy !== "idle"}
								onClick={() => void handleCheckUpdate()}
							>
								<RefreshCw
									className={cn(
										"mr-1.5 size-3.5",
										updateBusy === "checking" && "animate-spin",
									)}
								/>
								Check now
							</Button>
						</div>
					</Row>
					{updateStatus?.notes ? (
						<p className="px-1 pb-3 text-xs text-muted-foreground">
							{updateStatus.notes}
						</p>
					) : null}
				</SettingsCard>

				<GroupLabel>Cloud sync</GroupLabel>
				<SettingsCard>
					<div
						id={settingsFocusDomId("local-pull-from-server")}
						data-settings-focus="local-pull-from-server"
						className="py-4 scroll-mt-24"
					>
						<div className="flex items-center gap-2 text-sm font-medium">
							{syncEnabled ? (
								<Cloud className="size-4 text-emerald-600" />
							) : (
								<CloudOff className="size-4 text-muted-foreground" />
							)}
							{busy === "pair"
								? "Connecting your account…"
								: syncEnabled
									? "Cloud sync enabled"
									: token
										? "Account connected · sync off"
										: "Cloud sync off"}
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							Connect using the same web account and GitHub sign-in you already use.
							Connecting does not enable sync: your local vault stays private until
							you explicitly turn sync on.
						</p>

						<div className="mt-4 flex flex-col gap-3">
							{pairing ? (
								<div className="rounded-lg border bg-muted/30 p-4 text-center">
									<Loader2 className="mx-auto size-5 animate-spin text-primary" />
									<p className="mt-2 text-sm font-medium">
										Finish signing in in your browser
									</p>
									<p className="mt-1 text-xs text-muted-foreground">
										Confirm this code on the web
									</p>
									<p className="mt-1 font-mono text-lg font-semibold tracking-[0.16em]">
										{pairing.userCode}
									</p>
									<div className="mt-3 flex justify-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												void openDesktopPairingPage(pairing.verificationUrl)
											}
										>
											Open browser again
										</Button>
										<Button variant="ghost" size="sm" onClick={cancelPairing}>
											Cancel
										</Button>
									</div>
								</div>
							) : token ? (
								<div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">
											{syncAccount?.name || "Skriuw account"}
										</p>
										<p className="truncate text-xs text-muted-foreground">
											{syncAccount?.email || serverUrl}
										</p>
									</div>
									<span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
										Connected
									</span>
								</div>
							) : (
								<details className="text-xs text-muted-foreground">
									<summary className="cursor-pointer select-none">
										Using a self-hosted server?
									</summary>
									<div className="mt-2 flex flex-col gap-1.5">
										<Label htmlFor="sync-server-url" className="text-xs">
											Server URL
										</Label>
										<Input
											id="sync-server-url"
											value={serverUrl}
											onChange={(event) => setServerUrl(event.target.value)}
											placeholder="https://your-skriuw-host.com"
											autoComplete="off"
											spellCheck={false}
										/>
									</div>
								</details>
							)}
							<div className="flex flex-wrap justify-end gap-2">
								{token ? (
									<Button
										variant="ghost"
										size="sm"
										disabled={busy !== "idle"}
										onClick={() => void handleDisconnectAccount()}
									>
										Disconnect account
									</Button>
								) : null}
								{syncEnabled ? (
									<Button
										variant="outline"
										size="sm"
										disabled={busy !== "idle"}
										onClick={() => void handleDisableSync()}
									>
										<CloudOff className="mr-1.5 h-3.5 w-3.5" /> Turn off sync
									</Button>
								) : null}
								{token ? (
									<Button
										size="sm"
										disabled={busy !== "idle"}
										onClick={() => void handleSync()}
									>
										{busy === "sync" ? (
											<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
										) : (
											<Cloud className="mr-1.5 h-3.5 w-3.5" />
										)}
										{syncEnabled ? "Sync now" : "Enable cloud sync"}
									</Button>
								) : !pairing ? (
									<Button
										size="sm"
										disabled={busy !== "idle" || !serverUrl.trim()}
										onClick={() => void handleConnectAccount()}
									>
										<LogIn className="mr-1.5 h-3.5 w-3.5" /> Connect Skriuw
										account
									</Button>
								) : null}
							</div>

							<AnimatePresence mode="wait" initial={false}>
								{pullError && busy !== "pull" ? (
									<m.div
										key="pull-error"
										className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3"
										initial={
											prefersReducedMotion
												? { opacity: 0 }
												: { opacity: 0, y: 4, scale: 0.98 }
										}
										animate={{ opacity: 1, y: 0, scale: 1 }}
										exit={
											prefersReducedMotion
												? { opacity: 0 }
												: { opacity: 0, y: -4, scale: 0.98 }
										}
										transition={pickTransition(prefersReducedMotion, {
											duration: 0.2,
											ease: EASE_OUT_QUART,
										})}
										aria-live="polite"
									>
										<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
										<p className="min-w-0 break-words text-xs text-destructive">
											{pullError}
										</p>
									</m.div>
								) : pullResult && busy !== "pull" ? (
									<SyncResultPanel
										key="pull-result"
										result={pullResult.result}
										origin={pullResult.origin}
										vaultRoot={vaultRoot}
										reduceMotion={prefersReducedMotion}
									/>
								) : null}
							</AnimatePresence>
						</div>
					</div>
				</SettingsCard>

				<GroupLabel>Backup</GroupLabel>
				<SettingsCard>
					<Row
						focusId="local-back-up-vault"
						title="Back up vault"
						description="Save a .zip of every note and folder."
					>
						<Button
							variant="outline"
							size="sm"
							onClick={handleExport}
							disabled={busy !== "idle"}
						>
							<Download className="mr-1.5 h-3.5 w-3.5" />
							{busy === "export" ? "Backing up…" : "Back up"}
						</Button>
					</Row>
					<Row
						focusId="local-restore-from-backup"
						title="Restore from backup"
						description="Replace the current vault with a .zip backup."
					>
						<Button
							variant="outline"
							size="sm"
							onClick={handleImport}
							disabled={busy !== "idle"}
						>
							<Upload className="mr-1.5 h-3.5 w-3.5" />
							{busy === "import" ? "Restoring…" : "Restore"}
						</Button>
					</Row>
					<div>
						<Row
							focusId="local-complete-snapshot"
							title="Complete snapshot"
							description="Capture settings, the SQLite index, the vault, and local AI data. Restoring wipes current desktop data and reloads Skriuw."
						>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={handleSnapshotExport}
									disabled={busy !== "idle"}
								>
									<Download className="mr-1.5 h-3.5 w-3.5" />
									{snapshotMode === "export" ? "Saving…" : "Snapshot"}
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={handleSnapshotImport}
									disabled={busy !== "idle"}
								>
									<Upload className="mr-1.5 h-3.5 w-3.5" />
									{snapshotMode === "import" ? "Restoring…" : "Restore snapshot"}
								</Button>
							</div>
						</Row>
						{busy === "snapshot" && (
							<div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3 pb-4">
								<div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
									<span className="min-w-0 truncate">
										{snapshotStatus ?? "Working…"}
									</span>
									<span className="shrink-0 tabular-nums">
										{snapshotProgress
											? `${snapshotProgress.completed}/${snapshotProgress.total}`
											: "Working…"}
									</span>
								</div>
								<div className="h-2 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary transition-all duration-300"
										style={{
											width: `${snapshotProgress?.percent ?? 35}%`,
										}}
									/>
								</div>
								<p className="text-xs text-muted-foreground">
									{snapshotProgress
										? `${Math.round(snapshotProgress.percent)}% complete${
												snapshotEta ? ` · ${snapshotEta}` : ""
											}`
										: "Preparing snapshot…"}
								</p>
							</div>
						)}
						{busy === "idle" &&
							snapshotState === "success" &&
							snapshotMode === null &&
							snapshotResult && (
								<div className="mb-4 flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
									<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
									<div className="min-w-0 space-y-1">
										<p className="text-sm font-medium text-foreground">
											Snapshot ready
										</p>
										<p className="break-words text-xs text-muted-foreground">
											Backed up everything to{" "}
											<span className="font-mono text-foreground">
												{snapshotResult}
											</span>
											. You can restore this exact desktop state later.
										</p>
									</div>
								</div>
							)}
					</div>
				</SettingsCard>

				<GroupLabel>Import</GroupLabel>
				<SettingsCard>
					<Row
						focusId="local-import-from-simplenote"
						title="Import from Simplenote"
						description="Pick your Simplenote export .zip. Notes, tags, and original dates are added to your vault; trashed notes go into a “Trash” folder."
					>
						<input
							ref={simplenoteInputRef}
							type="file"
							accept=".zip"
							className="hidden"
							onChange={handleSimplenoteImport}
						/>
						<Button
							variant="outline"
							size="sm"
							onClick={() => simplenoteInputRef.current?.click()}
							disabled={busy !== "idle"}
						>
							<FileDown className="mr-1.5 h-3.5 w-3.5" />
							{busy === "simplenote" ? "Importing…" : "Import"}
						</Button>
					</Row>
				</SettingsCard>

				<Dialog
					open={simplenoteDialogOpen}
					onOpenChange={(open) => {
						setSimplenoteDialogOpen(open);
						if (!open && busy !== "simplenote") {
							resetSimplenoteFlow();
						}
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Import from Simplenote</DialogTitle>
							<DialogDescription>
								{simplenoteFile
									? `Review what will happen when importing ${simplenoteFile.name}.`
									: "Review your Simplenote import."}
							</DialogDescription>
						</DialogHeader>

						{simplenotePreview ? (
							<div className="space-y-4">
								<div className="space-y-2 text-sm text-muted-foreground">
									<p>
										{simplenotePreview.total} notes found
										{simplenotePreview.trashed > 0
											? ` · ${simplenotePreview.trashed} from Simplenote Trash`
											: ""}
									</p>
									<p>
										{simplenotePreview.dated} notes from{" "}
										{simplenotePreview.years.length} years found
										{simplenotePreview.undated > 0
											? ` · ${simplenotePreview.undated} without creation dates`
											: ""}
									</p>
									{simplenotePreview.duplicates > 0 ? (
										<div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
											<p className="font-medium text-foreground">
												{simplenotePreview.duplicates}{" "}
												{simplenotePreview.duplicates === 1
													? "duplicate found"
													: "duplicates found"}{" "}
												and {simplenotePreview.unique} unique.
											</p>
											{simplenotePreview.samples.length > 0 && (
												<p className="mt-1">
													Matches: {simplenotePreview.samples.join(", ")}
												</p>
											)}
										</div>
									) : (
										<p>No existing notes match this import.</p>
									)}
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs text-muted-foreground">
										Duplicate handling
									</Label>
									<Select
										value={simplenotePolicy}
										onValueChange={(value) =>
											setSimplenotePolicy(value as SimplenoteDuplicatePolicy)
										}
										disabled={busy === "simplenote"}
									>
										<SelectTrigger className="h-11 sm:h-8">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="skip">
												Do not import duplicates
											</SelectItem>
											<SelectItem value="overwrite">
												Overwrite existing notes
											</SelectItem>
											<SelectItem value="duplicate">
												Import duplicate copies
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								{simplenotePreview.years.length > 0 && (
									<div className="space-y-1.5">
										<Label className="text-xs text-muted-foreground">
											Save location
										</Label>
										<Select
											value={simplenoteOrganization}
											onValueChange={(value) =>
												setSimplenoteOrganization(
													value as SimplenoteOrganizationMode,
												)
											}
											disabled={busy === "simplenote"}
										>
											<SelectTrigger className="h-11 sm:h-8">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="root">
													Save all notes in root
												</SelectItem>
												<SelectItem value="year">
													Organize into year folders
												</SelectItem>
											</SelectContent>
										</Select>
										<p className="text-xs text-muted-foreground">
											Years:{" "}
											{simplenotePreview.years
												.map((bucket) => `${bucket.year} (${bucket.count})`)
												.join(", ")}
										</p>
									</div>
								)}
								<div className="flex items-start justify-between gap-4 rounded-md border border-border/60 p-3">
									<div className="space-y-1">
										<Label className="text-xs text-foreground">
											AI title pass
										</Label>
										<p className="text-xs text-muted-foreground">
											After import, generate reviewable H1 titles for notes
											over 100 characters with multiple paragraphs.
										</p>
										<p className="text-xs text-muted-foreground">
											{simplenotePreview.total} notes will be checked after
											duplicate handling.
										</p>
									</div>
									<Switch
										checked={generateAiTitles}
										onCheckedChange={setGenerateAiTitles}
										disabled={busy === "simplenote"}
									/>
								</div>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								Reading Simplenote archive…
							</p>
						)}

						{busy === "simplenote" &&
							simplenoteProgress.total > 0 &&
							aiTitleStage === "idle" && (
								<ImportProgress
									imported={simplenoteProgress.imported}
									total={simplenoteProgress.total}
								/>
							)}

						{aiTitleStage === "generating" && (
							<div className="space-y-2 rounded-md border border-border/60 p-3 text-sm">
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>Generating AI titles</span>
									<span>
										{aiTitleProgress?.completed ?? 0}/
										{aiTitleProgress?.total ?? 0} checked
									</span>
								</div>
								<div className="h-2 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary transition-all duration-300"
										style={{
											width: `${
												aiTitleProgress?.total
													? Math.round(
															((aiTitleProgress.completed ?? 0) /
																aiTitleProgress.total) *
																100,
														)
													: 0
											}%`,
										}}
									/>
								</div>
								<p className="text-xs text-muted-foreground">
									{aiTitleProgress?.succeeded ?? 0} succeeded ·{" "}
									{aiTitleProgress?.failed ?? 0} failed
									{formatAiTitleEta(aiTitleProgress)
										? ` · ${formatAiTitleEta(aiTitleProgress)}`
										: ""}
								</p>
							</div>
						)}

						{aiTitleStage === "review" && (
							<div className="space-y-3 rounded-md border border-border/60 p-3">
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-foreground">
											{aiTitleSuggestions.length} AI title suggestions
										</p>
										<p className="text-xs text-muted-foreground">
											Review generated headings before applying them to
											imported notes.
										</p>
									</div>
									{aiTitleFailures.length > 0 && (
										<p className="text-xs text-warning-foreground">
											{aiTitleFailures.length} failed
										</p>
									)}
								</div>
								{aiTitleSuggestions.length > 0 ? (
									<div className="max-h-52 space-y-2 overflow-auto pr-1">
										{aiTitleSuggestions.map((suggestion) => {
											const selected = selectedAiTitleIds.has(
												suggestion.noteId,
											);
											return (
												<div
													key={suggestion.noteId}
													className="rounded-md border border-border/60 p-2 text-xs"
												>
													<div className="flex items-center justify-between gap-2">
														<div className="min-w-0">
															<p className="truncate font-medium text-foreground">
																{suggestion.title}
															</p>
															<p className="truncate text-muted-foreground">
																{suggestion.noteName}
															</p>
														</div>
														<Button
															type="button"
															variant={
																selected ? "default" : "outline"
															}
															size="sm"
															onClick={() =>
																setSelectedAiTitleIds((current) => {
																	const next = new Set(current);
																	if (next.has(suggestion.noteId))
																		next.delete(
																			suggestion.noteId,
																		);
																	else
																		next.add(suggestion.noteId);
																	return next;
																})
															}
														>
															{selected ? "Selected" : "Skipped"}
														</Button>
													</div>
													<p className="mt-2 line-clamp-2 text-muted-foreground">
														{suggestion.previewContent}
													</p>
												</div>
											);
										})}
									</div>
								) : (
									<p className="text-xs text-muted-foreground">
										No usable title suggestions were generated.
									</p>
								)}
							</div>
						)}

						<DialogFooter>
							{aiTitleStage === "review" ? (
								<>
									<Button
										variant="outline"
										size="sm"
										onClick={discardAiTitleSuggestions}
									>
										Discard titles
									</Button>
									<Button
										size="sm"
										disabled={
											busy === "simplenote" || selectedAiTitleIds.size === 0
										}
										onClick={applyAiTitleSuggestions}
									>
										{busy === "simplenote"
											? "Applying…"
											: `Apply ${selectedAiTitleIds.size} titles`}
									</Button>
								</>
							) : (
								<>
									<DialogClose asChild>
										<Button
											variant="outline"
											size="sm"
											disabled={busy === "simplenote"}
										>
											Cancel
										</Button>
									</DialogClose>
									<Button
										size="sm"
										disabled={!simplenotePreview || busy === "simplenote"}
										onClick={confirmSimplenoteImport}
									>
										{busy === "simplenote" ? "Importing…" : "Import notes"}
									</Button>
								</>
							)}
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<GroupLabel>Maintenance</GroupLabel>
				<SettingsCard>
					<NoteCleanupRow
						phase={cleanup.phase}
						onScan={cleanup.scan}
						disabled={busy !== "idle"}
					/>
					<Row
						focusId="local-organize-by-year"
						title="Organize by year"
						description="Move root notes with creation dates into year folders."
					>
						<Button
							variant="outline"
							size="sm"
							onClick={handleOrganizeByYear}
							disabled={busy !== "idle"}
						>
							<FolderTree className="mr-1.5 h-3.5 w-3.5" />
							{busy === "organize" ? "Organizing…" : "Organize"}
						</Button>
					</Row>
					{cleanupPrompt && (
						<div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
							<p className="text-xs text-muted-foreground">
								Imports often bring along empty or duplicate notes. Scan for them
								now?
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setCleanupPrompt(false);
									void cleanup.scan();
								}}
							>
								Scan for junk notes
							</Button>
						</div>
					)}
				</SettingsCard>
				<NoteCleanupDialog
					result={cleanup.result}
					onOpenChange={(open) => {
						if (!open) cleanup.reset();
					}}
				/>

				<GroupLabel>Danger zone</GroupLabel>
				<SettingsCard>
					<Row
						focusId="local-reset-app"
						title="Reset app"
						description="Permanently remove app data, local AI data, and the vault."
					>
						<Dialog
							open={resetDialogOpen}
							onOpenChange={(open) => {
								setResetDialogOpen(open);
								if (!open && busy !== "reset") {
									resetDesktopResetFlow();
								}
							}}
						>
							<DialogTrigger asChild>
								<Button variant="destructive" size="sm" disabled={busy !== "idle"}>
									<RotateCcw className="mr-1.5 h-3.5 w-3.5" />
									Reset app
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Reset Skriuw?</DialogTitle>
									<DialogDescription>
										This wipes the desktop app state, local AI data, and vault
										contents. Back up first if you want to keep anything.
									</DialogDescription>
								</DialogHeader>
								<div className="space-y-4">
									<div className="space-y-1.5">
										<Label
											htmlFor="reset-confirm"
											className="text-xs text-muted-foreground"
										>
											Type{" "}
											<span className="font-mono text-foreground">
												{RESET_PHRASE}
											</span>{" "}
											to confirm
										</Label>
										<Input
											id="reset-confirm"
											value={resetConfirm}
											onChange={(event) =>
												setResetConfirm(event.target.value)
											}
											disabled={busy === "reset"}
											autoComplete="off"
											spellCheck={false}
											placeholder={RESET_PHRASE}
										/>
									</div>
									<label className="flex items-start gap-2 text-xs text-muted-foreground">
										<input
											type="checkbox"
											className="mt-0.5"
											checked={removeAiKeys}
											disabled={busy === "reset"}
											onChange={(event) =>
												setRemoveAiKeys(event.target.checked)
											}
										/>
										<span>
											Also remove saved AI provider keys from this computer's
											credential store. They live outside the app data a reset
											clears, so they are kept unless you check this.
										</span>
									</label>
									{busy === "reset" && (
										<div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
											<div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
												<span>{resetStatus ?? "Working…"}</span>
												<span>
													{resetProgress
														? `${resetProgress.completed}/${resetProgress.total}`
														: "Working…"}
												</span>
											</div>
											<div className="h-2 overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full bg-primary transition-all duration-300"
													style={{
														width: `${resetProgress?.percent ?? 35}%`,
													}}
												/>
											</div>
											<p className="text-xs text-muted-foreground">
												{resetProgress
													? `${Math.round(resetProgress.percent)}% complete${
															resetEta ? ` · ${resetEta}` : ""
														}`
													: "Preparing reset…"}
											</p>
										</div>
									)}
									{resetState === "success" && (
										<div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
											<div className="flex items-start gap-3">
												<CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
												<div className="space-y-1">
													<p className="text-sm font-medium text-foreground">
														Desktop data cleared
													</p>
													<p className="text-xs text-muted-foreground">
														Skriuw will reload with a fresh app state
														now.
													</p>
												</div>
											</div>
										</div>
									)}
									{resetState === "error" && notice ? (
										<p className="break-words text-xs text-destructive">
											{notice}
										</p>
									) : null}
								</div>
								<DialogFooter>
									<DialogClose asChild>
										<Button
											variant="outline"
											size="sm"
											disabled={busy === "reset"}
										>
											Cancel
										</Button>
									</DialogClose>
									<Button
										variant="destructive"
										size="sm"
										onClick={handleResetApp}
										disabled={busy === "reset" || !resetMatches}
									>
										<RotateCcw className="mr-1.5 h-3.5 w-3.5" />
										{busy === "reset" ? "Resetting…" : "Reset app"}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</Row>
				</SettingsCard>

				{notice ? (
					<p className="mt-4 break-words text-xs text-muted-foreground">{notice}</p>
				) : null}
			</div>
		</LazyMotion>
	);
}
