import { invokeBrowser } from "@/platform/browser/invoke";
import { invokeDesktop } from "@/platform/desktop/invoke";

/** True when the renderer is running in a browser rather than the Tauri shell. */
export function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
}

/**
 * True when running inside the Tauri desktop shell, where the Tauri IPC
 * bridge is available.
 */
export function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Refuses a capability that only the desktop shell implements. The surface that
 * offers it should already be hidden in the browser; this is the backstop that
 * keeps a stray caller from reaching a command the browser worker cannot serve.
 *
 * @param capability Named in the thrown message, so the refusal is actionable.
 */
export function requireDesktopRuntime(capability: string): void {
  if (isBrowserRuntime()) {
    throw new Error(`${capability} needs the desktop app.`);
  }
}

/**
 * Runtime-neutral command invocation, and the one place a command is routed to
 * the desktop or browser adapter. The browser path deliberately goes through a
 * worker so SQLite-WASM/OPFS can be added without changing callers.
 */
export function invoke<T>(command: string, args?: unknown): Promise<T> {
  if (!isBrowserRuntime()) {
    return invokeDesktop<T>(command, args);
  }
  return invokeBrowser<T>(command, args ?? null);
}
