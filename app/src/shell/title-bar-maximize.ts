import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hasTauriRuntime } from "@/bridge/external-links";
import { noop } from "@/shared/lib/noop";

/**
 * Restores the OS title-bar gesture the undecorated window loses: a double
 * click on a drag region maximizes, and maximized it returns to the previous
 * size and position. Only a direct hit on the drag element counts, so buttons
 * and labels inside a header row keep their own double-click behavior.
 */
export function useTitleBarDoubleClickMaximize() {
  useEffect(() => {
    if (!hasTauriRuntime()) return;
    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.hasAttribute("data-tauri-drag-region")) return;
      void getCurrentWindow().toggleMaximize().catch(noop);
    };
    document.addEventListener("dblclick", onDoubleClick);
    return () => document.removeEventListener("dblclick", onDoubleClick);
  }, []);
}
