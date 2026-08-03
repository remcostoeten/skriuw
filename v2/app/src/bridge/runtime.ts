import { invoke as tauriInvoke } from "@tauri-apps/api/core";

type BrowserBridgeRequest = {
  type: "invoke";
  id: number;
  command: string;
  args: unknown;
};

type BrowserBridgeResponse = {
  type: "response";
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

let browserWorker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

/** True when the renderer is running in a browser rather than the Tauri shell. */
export function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
}

function getBrowserWorker(): Worker {
  if (browserWorker) return browserWorker;

  browserWorker = new Worker(new URL("./browser-worker.ts", import.meta.url), {
    type: "module",
    name: "skriuw-storage",
  });
  browserWorker.addEventListener("message", (event: MessageEvent<BrowserBridgeResponse>) => {
    if (event.data?.type !== "response") return;
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.ok) request.resolve(event.data.value);
    else request.reject(new Error(event.data.error ?? "Browser bridge request failed"));
  });
  browserWorker.addEventListener("error", (event) => {
    const error = event.error ?? new Error(event.message || "Browser bridge worker failed");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    browserWorker = null;
  });
  return browserWorker;
}

function invokeBrowser<T>(command: string, args: unknown): Promise<T> {
  const id = nextRequestId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: (value) => resolve(value as T), reject });
    const request: BrowserBridgeRequest = { type: "invoke", id, command, args };
    try {
      getBrowserWorker().postMessage(request);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

/**
 * Runtime-neutral command invocation. The browser path deliberately goes
 * through a worker so SQLite-WASM/OPFS can be added without changing callers.
 */
export function invoke<T>(command: string, args?: unknown): Promise<T> {
  if (!isBrowserRuntime()) {
    return args === undefined
      ? tauriInvoke<T>(command)
      : tauriInvoke<T>(command, args as Record<string, unknown>);
  }
  return invokeBrowser<T>(command, args ?? null);
}

