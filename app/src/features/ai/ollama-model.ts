import type { LocalAiProgress, LocalAiRuntimeState, LocalAiStatus } from "@/contracts/ai";
import { formatByteSize } from "@/shared/lib/format-bytes";

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
