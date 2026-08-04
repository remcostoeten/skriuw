import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  BrowserStorageWorkerClient,
  type BrowserStorageFailure,
} from "../../../crates/skriuw-sqlite-wasm/web/worker-client.ts";

type BrowserWorkerValue = {
  kind: string;
  value?: unknown;
};

type BrowserCommand = {
  kind: string;
  payload?: unknown;
  expected: string;
};

let browserStorage: Promise<BrowserStorageWorkerClient> | null = null;

/** True when the renderer is running in a browser rather than the Tauri shell. */
export function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
}

function getBrowserStorage(): Promise<BrowserStorageWorkerClient> {
  if (browserStorage) return browserStorage;
  const worker = new Worker(new URL("./browser-worker.ts", import.meta.url), {
    type: "module",
    name: "skriuw-storage",
  });
  const client = new BrowserStorageWorkerClient(worker);
  browserStorage = client.initialize().then(() => client).catch((error) => {
    client.terminate();
    browserStorage = null;
    throw error;
  });
  return browserStorage;
}

async function invokeBrowser<T>(command: string, args: unknown): Promise<T> {
  if (command === "browser_storage_capabilities") {
    return {
      opfs: typeof navigator.storage?.getDirectory === "function",
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
    } as T;
  }
  if (command === "close_workspace_window") {
    const client = await getBrowserStorage();
    await client.close();
    browserStorage = null;
    return undefined as T;
  }

  const mapped = browserCommand(command, args);
  const client = await getBrowserStorage();
  const response = await client.request<BrowserWorkerValue>(mapped.kind, mapped.payload);
  if (response.kind !== mapped.expected) {
    client.terminate();
    browserStorage = null;
    throw browserFailure(
      "worker_crashed",
      `Browser storage returned ${response.kind}; expected ${mapped.expected}.`,
      true,
    );
  }
  return response.value as T;
}

function browserCommand(command: string, args: unknown): BrowserCommand {
  switch (command) {
    case "bootstrap_workspace":
      return { kind: "bootstrap", expected: "bootstrap" };
    case "load_sidebar_expansion":
      return { kind: "load_sidebar_expansion", expected: "sidebar_expansion" };
    case "save_sidebar_expansion":
      return { kind: "save_sidebar_expansion", payload: args, expected: "unit" };
    case "load_pane_layout":
      return { kind: "load_pane_layout", expected: "pane_layout" };
    case "save_pane_layout":
      return { kind: "save_pane_layout", payload: args, expected: "unit" };
    case "apply_workspace_operations":
      return { kind: "apply_operations", payload: args, expected: "operation" };
    case "search_workspace":
      return { kind: "search", payload: args, expected: "search" };
    default:
      throw browserFailure(
        "invalid_request",
        `The ${command} capability is not available in the browser runtime.`,
      );
  }
}

function browserFailure(
  code: BrowserStorageFailure["code"],
  message: string,
  terminal = false,
): BrowserStorageFailure {
  return {
    code,
    message,
    recovery: "Use the supported browser-local workspace actions or export a portable archive.",
    terminal,
  };
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
