import { Channel } from "@tauri-apps/api/core";
import { invoke, requireDesktopRuntime } from "@/bridge/runtime";
import type { LocalAiModel, LocalAiProgress, LocalAiStatus } from "@/contracts/ai";
import { noop } from "@/shared/lib/noop";

type ProgressCallback = (progress: LocalAiProgress) => void;

export type OllamaSnapshot = {
  status: LocalAiStatus;
  models: LocalAiModel[];
};

export function ollamaRuntimeStatus(): Promise<LocalAiStatus> {
  requireDesktop();
  return invoke<LocalAiStatus>("ollama_runtime_status");
}

export function startOllamaRuntime(): Promise<LocalAiStatus> {
  requireDesktop();
  return invoke<LocalAiStatus>("start_ollama_runtime");
}

export function stopOllamaRuntime(): Promise<LocalAiStatus> {
  requireDesktop();
  return invoke<LocalAiStatus>("stop_ollama_runtime");
}

export function listOllamaModels(): Promise<LocalAiModel[]> {
  requireDesktop();
  return invoke<LocalAiModel[]>("list_ollama_models");
}

export async function loadOllamaSnapshot(): Promise<OllamaSnapshot> {
  const status = await ollamaRuntimeStatus();
  const models = status.state === "running" ? await listOllamaModels() : [];
  return { status, models };
}

export function deleteOllamaModel(model: string): Promise<void> {
  requireDesktop();
  return invoke<void>("delete_ollama_model", { model });
}

export function installOllamaRuntime(
  onProgress: ProgressCallback,
  signal: AbortSignal,
): Promise<LocalAiStatus> {
  return runProgressOperation(
    "install_ollama_runtime",
    {},
    onProgress,
    signal,
  );
}

export function pullOllamaModel(
  model: string,
  onProgress: ProgressCallback,
  signal: AbortSignal,
): Promise<void> {
  return runProgressOperation(
    "pull_ollama_model",
    { model },
    onProgress,
    signal,
  );
}

async function runProgressOperation<T>(
  command: string,
  args: Record<string, unknown>,
  onProgress: ProgressCallback,
  signal: AbortSignal,
): Promise<T> {
  requireDesktop();
  signal.throwIfAborted();
  const operationId = crypto.randomUUID();
  const channel = new Channel<LocalAiProgress>();
  let active = true;
  channel.onmessage = (progress) => {
    if (active && progress.operationId === operationId) {
      onProgress(progress);
    }
  };
  const abort = () => {
    active = false;
    void invoke<boolean>("cancel_ollama_operation", { operationId }).catch(noop);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await invoke<T>(command, { ...args, operationId, onEvent: channel });
  } finally {
    active = false;
    signal.removeEventListener("abort", abort);
  }
}

function requireDesktop(): void {
  requireDesktopRuntime("Local AI runtime management");
}
