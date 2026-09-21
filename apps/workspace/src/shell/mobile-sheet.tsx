import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { sheetDragCloses, sheetDragOffset, swipeAxis, type SwipeEdge } from "./edge-swipe";
import { bindOverlayBack } from "./overlay-history";
import { haptic } from "@/shared/lib/haptics";
import { CloseIcon } from "@/shared/icons/static";

type Props = {
  side: SwipeEdge;
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

type DragState = {
  pointerId: number;
  x: number;
  y: number;
  axis: "x" | "y" | null;
};

const EXIT_MS = 220;

/**
 * A side panel for the compact shell. It overlays the editor from one edge,
 * closes on scrim tap, Escape, the platform back gesture, or a pull back
 * toward its edge, and stays mounted through its exit transition so the
 * dismissal reads as motion rather than a cut. The caller marks the page
 * behind it inert; the sheet itself only owns focus while open.
 */
export function MobileSheet({ side, open, label, onClose, children }: Props) {
  const [mounted, setMounted] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true });
    }
    const releaseBack = bindOverlayBack(() => onCloseRef.current());
    // Escape only reaches the sheet from inside it or from the page: a menu
    // or dialog layered above owns its own Escape and must not take the sheet
    // down with it.
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      const inside =
        target === document.body ||
        target === document.documentElement ||
        (target instanceof Node && panel?.contains(target) === true);
      if (event.key === "Escape" && !event.defaultPrevented && inside) {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      releaseBack();
      document.removeEventListener("keydown", onKeyDown);
      const previous = returnFocusRef.current;
      const active = document.activeElement;
      if (previous?.isConnected && (active === null || active === document.body || panel?.contains(active))) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open]);

  // Tree rows own their own horizontal swipe, so a pull that starts on the
  // tree is theirs; everywhere else on the sheet a pull toward the edge closes.
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.pointerType !== "touch") {
      return;
    }
    if (event.target instanceof Element && event.target.closest('[role="tree"]')) {
      return;
    }
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel || event.pointerId !== drag.pointerId) {
      return;
    }
    if (drag.axis === null) {
      drag.axis = swipeAxis({ x: drag.x, y: drag.y, edge: null }, event.clientX, event.clientY);
      if (drag.axis === "y") {
        dragRef.current = null;
        return;
      }
      if (drag.axis === "x") {
        panel.setPointerCapture(event.pointerId);
      }
    }
    if (drag.axis === "x") {
      const offset = sheetDragOffset(side, event.clientX - drag.x);
      panel.style.transition = "none";
      panel.style.transform = `translateX(${offset}px)`;
    }
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>, commit: boolean): void {
    const drag = dragRef.current;
    const panel = panelRef.current;
    dragRef.current = null;
    if (!drag || !panel || event.pointerId !== drag.pointerId) {
      return;
    }
    if (panel.hasPointerCapture(event.pointerId)) {
      panel.releasePointerCapture(event.pointerId);
    }
    panel.style.transition = "";
    panel.style.transform = "";
    if (commit && drag.axis === "x" && sheetDragCloses(side, event.clientX - drag.x)) {
      haptic("select");
      onCloseRef.current();
    }
  }

  if (!mounted) {
    return null;
  }
  return (
    <div className="mobile-sheet-root" data-state={open ? "open" : "closed"} data-side={side}>
      <div className="mobile-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="mobile-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endDrag(event, true)}
        onPointerCancel={(event) => endDrag(event, false)}
      >
        <div className="mobile-sheet-header">
          <span>{label}</span>
          <button type="button" className="mobile-sheet-close" aria-label={`Close ${label}`} onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="mobile-sheet-body">{children}</div>
      </div>
    </div>
  );
}
