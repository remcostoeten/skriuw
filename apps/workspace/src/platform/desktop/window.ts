import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow, type CloseRequestedEvent } from "@tauri-apps/api/window";
import { noop } from "@skriuw/shared/helpers/noop";

export function toggleMaximize(): void {
  const appWindow = getCurrentWindow();
  void appWindow.toggleMaximize().catch(noop);
}

/**
 * Closes through the window close-request flow so active-note persistence
 * runs before the process exits, same as clicking the window close button.
 */
export function quitApp(): void {
  void getCurrentWindow().close().catch(noop);
}

export function minimizeWindow(): Promise<void> {
  return getCurrentWindow().minimize();
}

export function toggleMaximizeWindow(): Promise<void> {
  return getCurrentWindow().toggleMaximize();
}

export function closeWindow(): Promise<void> {
  return getCurrentWindow().close();
}

export function isWindowMaximized(): Promise<boolean> {
  return getCurrentWindow().isMaximized();
}

export function onWindowResized(listener: () => void): Promise<UnlistenFn> {
  return getCurrentWindow().onResized(listener);
}

export function onWindowCloseRequested(
  handler: (event: CloseRequestedEvent) => void | Promise<void>,
): Promise<UnlistenFn> {
  return getCurrentWindow().onCloseRequested(handler);
}

export function setWebviewZoom(factor: number): Promise<void> {
  return getCurrentWebview().setZoom(factor);
}
