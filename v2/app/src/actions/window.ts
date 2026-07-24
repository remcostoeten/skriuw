import { getCurrentWindow } from "@tauri-apps/api/window";
import { noop } from "../shared/lib/noop";

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
