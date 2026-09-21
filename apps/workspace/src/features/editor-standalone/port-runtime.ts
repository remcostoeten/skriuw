import { activeEditorSession } from "./active-session";

/**
 * Stands in for `@/bridge/runtime` in the standalone editor bundle (see
 * `standaloneEditorBridge` in `apps/workspace/harnesses/editor-host/vite.config.ts`).
 * Every bridge command the editor feature reaches funnels through `invoke`, so
 * replacing this one module routes them all over the editor protocol and keeps
 * the Tauri and storage-worker adapters out of the bundle.
 */

/** The webview has no desktop shell; desktop-only capabilities refuse as they do in the browser build. */
export function isBrowserRuntime(): boolean {
  return true;
}

export function requireDesktopRuntime(capability: string): void {
  throw new Error(`${capability} needs the desktop app.`);
}

export function releaseBrowserStorage(): Promise<void> {
  return Promise.resolve();
}

export function clearBrowserData(): Promise<void> {
  return Promise.reject(new Error("Clearing workspace data is owned by the host app."));
}

export function invoke<T>(command: string, args?: unknown): Promise<T> {
  return activeEditorSession().invoke<T>(command, args);
}
