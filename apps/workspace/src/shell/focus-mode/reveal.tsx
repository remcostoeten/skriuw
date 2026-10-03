import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { usesVimMode } from "@/features/settings/settings-model";
import { ExitFullscreenIcon } from "@/shared/icons/static";
import { escapeExitsFocusMode, focusModeAnnouncement } from "./model";
import { toolbarIconButtonClass } from "@/shared/ui/toolbar-button";
import { WindowControls } from "../title-bar/window-controls";

const OVERLAY_SELECTOR = 'dialog[open], [role="dialog"], [role="menu"], [data-modal="true"]';

const EDITOR_SELECTOR = ".editor-pane .ProseMirror, .editor-pane .cm-content";

const REVEAL_DISTANCE = 40;

type Props = {
  store: RendererStore;
  active: boolean;
  shortcut: string | undefined;
  onExit: () => void;
};

function overlayOpen(): boolean {
  return document.querySelector(OVERLAY_SELECTOR) !== null;
}

function focusIsLost(): boolean {
  const active = document.activeElement;
  return (
    !(active instanceof HTMLElement) ||
    active === document.body ||
    active.closest("[inert]") !== null ||
    active.getClientRects().length === 0
  );
}

function rescueFocus(): void {
  if (focusIsLost()) {
    document.querySelector<HTMLElement>(EDITOR_SELECTOR)?.focus();
  }
}

export function FocusModeReveal({ store, active, shortcut, onExit }: Props) {
  const [announcement, setAnnouncement] = useState("");
  const [revealed, setRevealed] = useState(false);
  const previousRef = useRef(active);

  useEffect(() => {
    if (previousRef.current === active) {
      return;
    }
    previousRef.current = active;
    setAnnouncement(focusModeAnnouncement(active));
    const frame = window.requestAnimationFrame(rescueFocus);
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    if (!active) {
      setRevealed(false);
      return;
    }
    let overlayAtStart = false;
    function onKeyDownCapture(event: KeyboardEvent): void {
      overlayAtStart = event.key === "Escape" && overlayOpen();
    }
    function onKeyDown(event: KeyboardEvent): void {
      const vimMode = usesVimMode(store.getState().settings);
      if (escapeExitsFocusMode(event, vimMode, overlayAtStart || overlayOpen())) {
        event.preventDefault();
        onExit();
      }
    }
    function onPointerMove(event: PointerEvent): void {
      if (event.pointerType === "touch") {
        return;
      }
      const near = event.clientY <= REVEAL_DISTANCE;
      setRevealed((current) => (current === near ? current : near));
    }
    window.addEventListener("keydown", onKeyDownCapture, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDownCapture, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [active, onExit, store]);

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {active ? (
        <div className="focus-mode-reveal" data-revealed={revealed} data-tauri-drag-region>
          <Tooltip label="Exit focus mode" side="bottom" shortcut={shortcut}>
            <button
              type="button"
              onClick={onExit}
              className={`focus-mode-exit ${toolbarIconButtonClass}`}
              aria-label="Exit focus mode"
            >
              <ExitFullscreenIcon size={16} />
            </button>
          </Tooltip>
          <WindowControls />
        </div>
      ) : null}
    </>
  );
}
