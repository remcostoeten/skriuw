import type { LocalAiProgress, LocalAiRuntimeState, LocalAiStatus } from "@/contracts/ai";
import { formatByteSize } from "@/shared/lib/format-bytes";
import { formatDuration } from "@/shared/lib/format-duration";

export const OLLAMA_INSTALL_SOURCE_URL = "https://ollama.com/download";

const STATE_LABELS: Record<LocalAiRuntimeState, string> = {
  not_installed: "Not installed",
  installed_stopped: "Ready to start",
  starting: "Starting",
  running: "Running",
  failed: "Stopped unexpectedly",
  unsupported: "Installer required",
};

export function ollamaStatusLabel(status: LocalAiStatus): string {
  if (status.state === "running" && status.version) {
    return `Running · v${status.version}`;
  }
  return STATE_LABELS[status.state];
}

export type OllamaRuntimeAction = "install" | "start" | "stop";

const PENDING_LABELS: Record<OllamaRuntimeAction, string> = {
  install: "Installing Ollama…",
  start: "Starting Ollama…",
  stop: "Stopping Ollama…",
};

const PENDING_DESCRIPTIONS: Record<OllamaRuntimeAction, string> = {
  install: "Downloading the runtime from ollama.com",
  start: "Waiting for the runtime to accept connections",
  stop: "Shutting the runtime down",
};

const PENDING_BUTTON_LABELS: Record<OllamaRuntimeAction, string> = {
  install: "Installing…",
  start: "Starting…",
  stop: "Stopping…",
};

export function ollamaPendingLabel(action: OllamaRuntimeAction): string {
  return PENDING_LABELS[action];
}

export function ollamaPendingDescription(action: OllamaRuntimeAction): string {
  return PENDING_DESCRIPTIONS[action];
}

export function ollamaPendingButtonLabel(action: OllamaRuntimeAction): string {
  return PENDING_BUTTON_LABELS[action];
}

export function ollamaOwnershipLabel(status: LocalAiStatus): string {
  if (status.state !== "running") {
    return status.endpoint;
  }
  return status.managed
    ? "Started by Skriuw · stops when Skriuw quits"
    : "Existing Ollama service · managed outside Skriuw";
}

export function ollamaProgressText(progress: LocalAiProgress): string {
  if (progress.type === "complete") {
    return progress.operation === "install" ? "Ollama installed." : "Model ready.";
  }
  if (progress.type === "cancelled") {
    return progress.operation === "install" ? "Installation cancelled." : "Model pull cancelled.";
  }
  const bytes = progress.totalBytes
    ? `${formatByteSize(progress.completedBytes)} of ${formatByteSize(progress.totalBytes)}`
    : progress.completedBytes > 0
      ? formatByteSize(progress.completedBytes)
      : null;
  return bytes ? `${progress.status} · ${bytes}` : progress.status;
}

export function ollamaProgressPercent(progress: LocalAiProgress | null): number | null {
  if (
    progress?.type !== "progress" ||
    !progress.totalBytes ||
    progress.totalBytes <= 0
  ) {
    return null;
  }
  return Math.min(100, Math.round((progress.completedBytes / progress.totalBytes) * 100));
}

/**
 * Renders "{spent}/{estimated finish}" (e.g. "12s/48s") from the elapsed time
 * and the current transfer rate. Returns null until there's enough signal
 * (a nonzero byte total and at least a second of elapsed time) to estimate.
 */
export function ollamaProgressTiming(
  progress: LocalAiProgress | null,
  elapsedMs: number,
): string | null {
  if (
    progress?.type !== "progress" ||
    !progress.totalBytes ||
    progress.totalBytes <= 0 ||
    progress.completedBytes <= 0 ||
    elapsedMs < 1_000
  ) {
    return null;
  }
  const elapsedSeconds = elapsedMs / 1000;
  const rate = progress.completedBytes / elapsedSeconds;
  const remainingBytes = Math.max(0, progress.totalBytes - progress.completedBytes);
  const estimatedTotalSeconds = elapsedSeconds + remainingBytes / rate;
  return `${formatDuration(elapsedSeconds)}/${formatDuration(estimatedTotalSeconds)}`;
}

export function ollamaModelSourceUrl(model: string): string {
  const base = model.split(":")[0]?.trim();
  return base ? `https://ollama.com/library/${encodeURIComponent(base)}` : OLLAMA_INSTALL_SOURCE_URL;
}
