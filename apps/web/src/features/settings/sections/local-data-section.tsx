"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  CalendarDays,
  CloudDownload,
  Download,
  FileDown,
  FileText,
  FolderOpen,
  FolderTree,
  CheckCircle2,
  Loader2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  GroupLabel,
  Row,
  SectionHeader,
  SettingsCard,
} from "@/features/settings/components/settings-primitives";
import { settingsFocusDomId } from "@/features/settings/lib/settings-focus-anchor";
import {
  NoteCleanupDialog,
  NoteCleanupRow,
} from "@/features/settings/components/note-cleanup";
import { useNoteCleanupScan } from "@/features/settings/lib/use-note-cleanup-scan";
import {
  tauriChannel,
  tauriInvoke,
  useWorkspaceBackend,
} from "@/core/workspace-backend";
import {
  importSimplenoteFile,
  previewSimplenoteFile,
  type SimplenoteDuplicatePolicy,
  type SimplenoteImportPreview,
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
import {
  pullWorkspaceFromServer,
  type PullResult,
} from "@/domain/sync/pull-workspace";
import {
  getSyncClientConfig,
  setSyncClientConfig,
} from "@/domain/sync/sync-client-config";
import {
  matchesDesktopResetPhrase,
  RESET_PHRASE,
} from "@/features/settings/lib/desktop-reset";

type Busy =
  | "idle"
  | "export"
  | "import"
  | "clear"
  | "pull"
  | "simplenote"
  | "snapshot"
  | "reset";
type AiTitleStage = "idle" | "generating" | "review";
type SnapshotState = "idle" | "working" | "success" | "error";
type SnapshotEvent =
  | { type: "status"; message: string }
  | { type: "progress"; completed: number; total: number; percent: number }
  | { type: "done"; path: string };

function ImportProgress({
  imported,
  total,
}: {
  imported: number;
  total: number;
}) {
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
  if (
    !progress ||
    progress.completed === 0 ||
    progress.completed >= progress.total
  )
    return null;
  const elapsedSeconds = Math.max((Date.now() - progress.startedAt) / 1000, 1);
  const secondsPerNote = elapsedSeconds / progress.completed;
  const remainingSeconds = Math.ceil(
    (progress.total - progress.completed) * secondsPerNote,
  );
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
  const remainingSeconds = Math.ceil(
    (progress.total - progress.completed) * secondsPerUnit,
  );
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
  if (phase === "pulling")
    return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
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
        <motion.span
          key={phase}
          className="inline-flex items-center gap-1.5"
          initial={
            reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, y: 8, filter: "blur(4px)" }
          }
          animate={
            reduceMotion
              ? { opacity: 1 }
              : { opacity: 1, y: 0, filter: "blur(0px)" }
          }
          exit={
            reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -8, filter: "blur(4px)" }
          }
          transition={swap}
        >
          <PullButtonIcon phase={phase} />
          {PULL_BUTTON_LABEL[phase]}
        </motion.span>
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
    <motion.div
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
    </motion.div>
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
    <motion.div
      className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3"
      initial={
        reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }
      }
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
          <span className="break-all font-mono text-foreground/90">
            {origin}
          </span>
        </p>
      </div>

      <motion.div
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
      </motion.div>

      {vaultRoot ? (
        <motion.div
          className="flex items-start gap-2 border-t border-emerald-500/20 pt-2.5"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...rowTransition, delay: reduceMotion ? 0 : 0.26 }}
        >
          <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="min-w-0 text-xs text-muted-foreground">
            Saved to your vault at{" "}
            <span className="break-all font-mono text-foreground/90">
              {vaultRoot}
            </span>
          </p>
        </motion.div>
      ) : null}
    </motion.div>
  );
}

/**
 * Desktop ("tauri" mode) replacement for the cloud Data & sync section. Every
 * action is local: the markdown vault is the source of truth, so backup is a
 * portable .zip of it and restore/clear rebuild the SQLite index from disk.
 */
export function LocalDataSection() {
  const queryClient = useQueryClient();
  const backend = useWorkspaceBackend();
  const [vaultRoot, setVaultRoot] = useState<string>("");
  const [busy, setBusy] = useState<Busy>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string>("");
  const [token, setToken] = useState<string>("");
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
  const [simplenotePreview, setSimplenotePreview] =
    useState<SimplenoteImportPreview | null>(null);
  const [simplenotePolicy, setSimplenotePolicy] =
    useState<SimplenoteDuplicatePolicy>("skip");
  const [simplenoteDialogOpen, setSimplenoteDialogOpen] = useState(false);
  const [simplenoteProgress, setSimplenoteProgress] = useState({
    imported: 0,
    total: 0,
  });
  const [generateAiTitles, setGenerateAiTitles] = useState(true);
  const [aiTitleStage, setAiTitleStage] = useState<AiTitleStage>("idle");
  const [aiTitleProgress, setAiTitleProgress] =
    useState<ImportTitleProgress | null>(null);
  const [aiTitleSuggestions, setAiTitleSuggestions] = useState<
    ImportTitleSuggestion[]
  >([]);
  const [aiTitleFailures, setAiTitleFailures] = useState<ImportTitleFailure[]>(
    [],
  );
  const [aiTitleNotes, setAiTitleNotes] = useState<NoteFile[]>([]);
  const [selectedAiTitleIds, setSelectedAiTitleIds] = useState<Set<string>>(
    new Set(),
  );
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [snapshotProgress, setSnapshotProgress] = useState<{
    completed: number;
    total: number;
    percent: number;
  } | null>(null);
  const [snapshotStartedAt, setSnapshotStartedAt] = useState<number | null>(
    null,
  );
  const [snapshotMode, setSnapshotMode] = useState<"export" | "import" | null>(
    null,
  );
  const [snapshotState, setSnapshotState] = useState<SnapshotState>("idle");
  const [snapshotResult, setSnapshotResult] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
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
    setSimplenoteProgress({ imported: 0, total: 0 });
    setAiTitleStage("idle");
    setAiTitleProgress(null);
    setAiTitleSuggestions([]);
    setAiTitleFailures([]);
    setAiTitleNotes([]);
    setSelectedAiTitleIds(new Set());
  }

  function resetDesktopResetFlow() {
    setResetConfirm("");
    setResetStatus(null);
    setResetProgress(null);
    setResetStartedAt(null);
    setResetState("idle");
  }

  useEffect(() => {
    tauriInvoke<string>("get_vault_root")
      .then(setVaultRoot)
      .catch(() => setVaultRoot(""));
  }, []);

  useEffect(() => {
    const config = getSyncClientConfig();
    if (config) {
      setServerUrl(config.serverUrl);
      setToken(config.token);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pullFlashTimer.current) clearTimeout(pullFlashTimer.current);
    };
  }, []);

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
      setSyncClientConfig({ serverUrl: url, token: tok });
      await queryClient.invalidateQueries({ queryKey: notesKeys.all });
      await queryClient.invalidateQueries({ queryKey: journalKeys.all });
      setPullResult({ result, origin: url, at: Date.now() });
      flashPull("success");
    } catch (error) {
      setPullError(error instanceof Error ? error.message : "Sync failed.");
      flashPull("error");
    } finally {
      setBusy("idle");
    }
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
      setNotice(error instanceof Error ? error.message : "Backup failed.");
    } finally {
      setBusy("idle");
    }
  };

  const handleImport = async () => {
    setBusy("import");
    setNotice(null);
    try {
      const restored = await tauriInvoke<boolean>("import_vault");
      if (restored) {
        await refreshWorkspace();
        setNotice("Vault restored from backup.");
        setCleanupPrompt(true);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Restore failed.");
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
      setNotice(
        error instanceof Error ? error.message : "Snapshot export failed.",
      );
    } finally {
      setBusy("idle");
      setSnapshotMode(null);
    }
  };

  const handleSnapshotImport = async () => {
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
      setNotice(
        error instanceof Error ? error.message : "Snapshot restore failed.",
      );
      setBusy("idle");
      setSnapshotMode(null);
    }
  };

  async function handleSimplenoteImport(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
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
    setAiTitleNotes([]);
    setSelectedAiTitleIds(new Set());
    try {
      setSimplenotePreview(await previewSimplenoteFile(file, backend));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Simplenote import failed.",
      );
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
    setAiTitleNotes([]);
    setSelectedAiTitleIds(new Set());
    try {
      const summary = await importSimplenoteFile(simplenoteFile, backend, {
        duplicatePolicy: simplenotePolicy,
        onProgress: (imported, total) =>
          setSimplenoteProgress({ imported, total }),
      });
      await refreshWorkspace();
      setCleanupPrompt(true);
      const parts = [`Imported ${summary.imported} notes from Simplenote`];
      if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`);
      if (summary.overwritten > 0)
        parts.push(`${summary.overwritten} overwritten`);
      if (summary.duplicated > 0)
        parts.push(`${summary.duplicated} duplicated`);
      if (summary.trashed > 0) parts.push(`${summary.trashed} sent to Trash`);
      setNotice(
        `${parts[0]}${parts.length > 1 ? ` (${parts.slice(1).join(", ")})` : ""}.`,
      );
      const titleCandidates = summary.importedNotes.filter(
        isImportTitleCandidate,
      );
      if (generateAiTitles && titleCandidates.length > 0) {
        setAiTitleStage("generating");
        setAiTitleNotes(summary.importedNotes);
        const result = await createImportTitleSuggestions(
          summary.importedNotes,
          {
            concurrency: 3,
            generateTitle: (content) => callAi("generateTitle", content),
            onProgress: setAiTitleProgress,
          },
        );
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
      setNotice(
        error instanceof Error ? error.message : "Simplenote import failed.",
      );
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
      const notesById = new Map(aiTitleNotes.map((note) => [note.id, note]));
      let applied = 0;
      for (const suggestion of selected) {
        const note = notesById.get(suggestion.noteId);
        if (!note) continue;
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
        if (result.note) applied++;
      }
      await refreshWorkspace();
      setNotice(`Applied ${applied} AI-generated titles.`);
      setSimplenoteDialogOpen(false);
      resetSimplenoteFlow();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Applying AI titles failed.",
      );
    } finally {
      setBusy("idle");
    }
  }

  function discardAiTitleSuggestions() {
    setNotice("Discarded AI-generated title suggestions.");
    setSimplenoteDialogOpen(false);
    resetSimplenoteFlow();
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
        setResetProgress(
          (current) => current ?? { completed: 0, total: 0, percent: 100 },
        );
        setResetStatus("Desktop data cleared. Reloading Skriuw…");
      });
      await tauriInvoke<void>("reset_desktop_data", { progress });
      window.location.reload();
    } catch (error) {
      if (resetSucceeded) return;
      setResetState("error");
      setNotice(error instanceof Error ? error.message : "Reset failed.");
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
      setNotice("Vault directory updated. Reload Skriuw to load it.");
    }
  };

  const handleReveal = async () => {
    await tauriInvoke<void>("reveal_vault").catch(() => undefined);
  };

  return (
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
      </SettingsCard>

      <GroupLabel>Cloud sync</GroupLabel>
      <SettingsCard>
        <div
          id={settingsFocusDomId("local-pull-from-server")}
          data-settings-focus="local-pull-from-server"
          className="py-4 scroll-mt-24"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <CloudDownload className="size-4 text-muted-foreground" />
            Pull from server
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Download your cloud workspace into this device. Create a token in
            the web app under{" "}
            <span className="font-mono text-foreground">
              Settings → Data &amp; sync
            </span>
            , then paste it here. This is one-way: it never uploads local
            changes.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Include the full address with scheme — e.g.{" "}
            <span className="font-mono text-foreground">
              http://localhost:3000
            </span>{" "}
            for local dev, or{" "}
            <span className="font-mono text-foreground">
              https://your-host.com
            </span>
            .
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="sync-server-url"
                className="text-xs text-muted-foreground"
              >
                Server URL
              </Label>
              <Input
                id="sync-server-url"
                value={serverUrl}
                onChange={(event) => setServerUrl(event.target.value)}
                disabled={busy === "pull"}
                placeholder="https://your-skriuw-host.com"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="sync-token"
                className="text-xs text-muted-foreground"
              >
                Sync token
              </Label>
              <Input
                id="sync-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                disabled={busy === "pull"}
                placeholder="sk_sync_…"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="flex justify-end">
              <PullButton
                phase={
                  busy === "pull" ? "pulling" : (pullFlash ?? "idle")
                }
                disabled={busy !== "idle" || !serverUrl.trim() || !token.trim()}
                reduceMotion={prefersReducedMotion}
                onClick={handlePull}
              />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {pullError && busy !== "pull" ? (
                <motion.div
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
                  <p className="text-xs text-destructive">{pullError}</p>
                </motion.div>
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
                  <SelectTrigger className="h-8">
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
              <div className="flex items-start justify-between gap-4 rounded-md border border-border/60 p-3">
                <div className="space-y-1">
                  <Label className="text-xs text-foreground">
                    AI title pass
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    After import, generate reviewable H1 titles for notes over
                    100 characters with multiple paragraphs.
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
                    Review generated headings before applying them to imported
                    notes.
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
                    const selected = selectedAiTitleIds.has(suggestion.noteId);
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
                            variant={selected ? "default" : "outline"}
                            size="sm"
                            onClick={() =>
                              setSelectedAiTitleIds((current) => {
                                const next = new Set(current);
                                if (next.has(suggestion.noteId))
                                  next.delete(suggestion.noteId);
                                else next.add(suggestion.noteId);
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
              <Button
                variant="destructive"
                size="sm"
                disabled={busy !== "idle"}
              >
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
                    onChange={(event) => setResetConfirm(event.target.value)}
                    disabled={busy === "reset"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={RESET_PHRASE}
                  />
                </div>
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
                          Skriuw will reload with a fresh app state now.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {resetState === "error" && notice ? (
                  <p className="text-xs text-destructive">{notice}</p>
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
        <p className="mt-4 text-xs text-muted-foreground">{notice}</p>
      ) : null}
    </div>
  );
}
