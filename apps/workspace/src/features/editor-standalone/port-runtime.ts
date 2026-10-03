import { activeEditorSession } from "./active-session";

/**
 * Stands in for `@/platform/runtime/runtime` in the standalone editor bundle (see
 * `standaloneEditorBridge` in `apps/workspace/harnesses/editor-host/standalone-editor-bridge.ts`).
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

export function hasTauriRuntime(): boolean {
  return false;
}

export function invoke<T>(command: string, args?: unknown): Promise<T> {
  return activeEditorSession().invoke<T>(command, args);
}
