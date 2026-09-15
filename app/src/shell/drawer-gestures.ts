import {
  classifySwipe,
  drawerProgress,
  drawerTranslate,
  openingDelta,
  pickDrawer,
  pushSample,
  releaseVelocity,
  resolveDrawerSettle,
  SWIPE_LONG_PRESS_MS,
  type DrawerAvailability,
  type DrawerPanel,
  type DrawerSide,
  type PointerSample,
} from "./drawer-physics";

/** Mirrors `--drawer-settle` in compact.css; the inline drag position is released once the settle transition has run. */
export const DRAWER_SETTLE_MS = 320;

export const DRAGGING_CLASS = "compact-dragging";

const PANEL_SIDE: Record<DrawerPanel, DrawerSide> = {
  sidebar: "left",
  metadata: "right",
};

const TRANSLATE_VAR: Record<DrawerPanel, string> = {
  sidebar: "--drawer-left-x",
  metadata: "--drawer-right-x",
};

const SCRIM_VAR = "--drawer-scrim";

export type DrawerGestureOptions = {
  container: HTMLElement;
  readState: () => DrawerAvailability;
  measure: (panel: DrawerPanel) => number;
  onSettle: (panel: DrawerPanel, open: boolean) => void;
};

type Session =
  | { phase: "pending"; startX: number; startY: number; startTime: number; target: EventTarget | null }
  | { phase: "ignored" }
  | {
      phase: "dragging";
      panel: DrawerPanel;
      side: DrawerSide;
      width: number;
      startProgress: number;
      startX: number;
      lastX: number;
      samples: PointerSample[];
      frame: number;
    };

function canScrollHorizontally(element: Element, dx: number): boolean {
  if (element.scrollWidth <= element.clientWidth + 1) {
    return false;
  }
  const overflow = getComputedStyle(element).overflowX;
  if (overflow !== "auto" && overflow !== "scroll") {
    return false;
  }
  if (dx > 0) {
    return element.scrollLeft > 0;
  }
  return element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
}

/**
 * Whether the swipe started on something that already owns horizontal
 * motion: a range slider, a region that opts out of panning, or a scroller
 * that can still move in the swipe direction.
 */
export function swipeClaimedBelow(target: EventTarget | null, container: HTMLElement, dx: number): boolean {
  let element = target instanceof Element ? target : null;
  while (element && element !== container) {
    if (element instanceof HTMLInputElement && element.type === "range") {
      return true;
    }
    if (element instanceof HTMLElement) {
      const touchAction = getComputedStyle(element).touchAction;
      if (touchAction === "none" || touchAction === "pan-x") {
        return true;
      }
    }
    if (canScrollHorizontally(element, dx)) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

/**
 * Touch-drags the compact-layout drawers. The gesture paints through CSS
 * custom properties on the shell container and never re-renders React until
 * the finger lifts, when the settled state is reported once.
 */
export function attachDrawerGestures(options: DrawerGestureOptions): () => void {
  const { container, readState, measure, onSettle } = options;
  let session: Session | null = null;
  let releaseTimer = 0;

  function clearInlinePosition() {
    container.style.removeProperty(TRANSLATE_VAR.sidebar);
    container.style.removeProperty(TRANSLATE_VAR.metadata);
    container.style.removeProperty(SCRIM_VAR);
  }

  function paint(panel: DrawerPanel, side: DrawerSide, progress: number, width: number) {
    container.style.setProperty(TRANSLATE_VAR[panel], `${drawerTranslate(side, progress, width)}px`);
    container.style.setProperty(SCRIM_VAR, String(Math.min(1, Math.max(0, progress / width))));
  }

  function currentProgress(drag: Extract<Session, { phase: "dragging" }>): number {
    const delta = openingDelta(drag.side, drag.lastX - drag.startX);
    return drawerProgress(drag.startProgress, delta, drag.width);
  }

  function applyFrame() {
    if (session?.phase !== "dragging") {
      return;
    }
    session.frame = 0;
    paint(session.panel, session.side, currentProgress(session), session.width);
  }

  function beginDrag(pending: Extract<Session, { phase: "pending" }>, touch: Touch, dx: number): boolean {
    const state = readState();
    const panel = pickDrawer(dx, state);
    if (panel === null) {
      return false;
    }
    const width = measure(panel);
    if (width <= 0) {
      return false;
    }
    const open = panel === "sidebar" ? state.sidebarOpen : state.metadataOpen;
    window.clearTimeout(releaseTimer);
    container.classList.add(DRAGGING_CLASS);
    session = {
      phase: "dragging",
      panel,
      side: PANEL_SIDE[panel],
      width,
      startProgress: open ? width : 0,
      startX: pending.startX,
      lastX: touch.clientX,
      samples: pushSample([], { x: pending.startX, time: pending.startTime }),
      frame: 0,
    };
    return true;
  }

  function finishDrag(drag: Extract<Session, { phase: "dragging" }>) {
    if (drag.frame !== 0) {
      window.cancelAnimationFrame(drag.frame);
    }
    const velocity = openingDelta(drag.side, releaseVelocity(drag.samples));
    const open = resolveDrawerSettle(currentProgress(drag), drag.width, velocity);
    container.classList.remove(DRAGGING_CLASS);
    paint(drag.panel, drag.side, open ? drag.width : 0, drag.width);
    onSettle(drag.panel, open);
    releaseTimer = window.setTimeout(clearInlinePosition, DRAWER_SETTLE_MS + 40);
  }

  function handleStart(event: TouchEvent) {
    if (event.touches.length !== 1) {
      if (session?.phase === "dragging") {
        finishDrag(session);
      }
      session = { phase: "ignored" };
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    session = {
      phase: "pending",
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: event.timeStamp,
      target: event.target,
    };
  }

  function handleMove(event: TouchEvent) {
    if (session === null || session.phase === "ignored") {
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    if (session.phase === "pending") {
      const dx = touch.clientX - session.startX;
      const dy = touch.clientY - session.startY;
      const intent = classifySwipe(dx, dy);
      if (intent === "undecided") {
        return;
      }
      if (
        intent === "vertical" ||
        event.timeStamp - session.startTime > SWIPE_LONG_PRESS_MS ||
        swipeClaimedBelow(session.target, container, dx) ||
        !beginDrag(session, touch, dx)
      ) {
        session = { phase: "ignored" };
        return;
      }
    }
    if (session.phase !== "dragging") {
      return;
    }
    event.preventDefault();
    session.lastX = touch.clientX;
    session.samples = pushSample(session.samples, { x: touch.clientX, time: event.timeStamp });
    if (session.frame === 0) {
      session.frame = window.requestAnimationFrame(applyFrame);
    }
  }

  function handleEnd() {
    if (session?.phase === "dragging") {
      finishDrag(session);
    }
    session = null;
  }

  container.addEventListener("touchstart", handleStart, { passive: true });
  container.addEventListener("touchmove", handleMove, { passive: false });
  container.addEventListener("touchend", handleEnd);
  container.addEventListener("touchcancel", handleEnd);
  return () => {
    container.removeEventListener("touchstart", handleStart);
    container.removeEventListener("touchmove", handleMove);
    container.removeEventListener("touchend", handleEnd);
    container.removeEventListener("touchcancel", handleEnd);
    window.clearTimeout(releaseTimer);
    if (session?.phase === "dragging" && session.frame !== 0) {
      window.cancelAnimationFrame(session.frame);
    }
    container.classList.remove(DRAGGING_CLASS);
    clearInlinePosition();
  };
}
