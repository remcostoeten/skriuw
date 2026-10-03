import { haptic } from "./haptics";

const LONG_PRESS_MS = 450;
const MOVE_SLOP_PX = 10;

/**
 * Turns a held touch on `element` into the `contextmenu` event a right click
 * would have produced, so a Radix context menu opens at the finger. Android
 * already synthesises the event on a long press and iOS never does, so a
 * native `contextmenu` cancels the timer and the timer covers the rest.
 * `onOpen` fires just before the event, so the owner can note that the menu
 * came from touch and swallow the click the tap leaves behind.
 */
export function bindLongPress(element: HTMLElement, onOpen: () => void): () => void {
  let timer: number | null = null;
  let origin: { id: number; x: number; y: number; target: EventTarget | null } | null = null;

  function cancel(): void {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    origin = null;
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== "touch" || !event.isPrimary) {
      return;
    }
    cancel();
    origin = { id: event.pointerId, x: event.clientX, y: event.clientY, target: event.target };
    timer = window.setTimeout(() => {
      const start = origin;
      cancel();
      if (!start) {
        return;
      }
      haptic("select");
      onOpen();
      const target = start.target instanceof Element ? start.target : element;
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: start.x,
          clientY: start.y,
        }),
      );
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!origin || event.pointerId !== origin.id) {
      return;
    }
    if (
      Math.abs(event.clientX - origin.x) > MOVE_SLOP_PX ||
      Math.abs(event.clientY - origin.y) > MOVE_SLOP_PX
    ) {
      cancel();
    }
  }

  function onPointerEnd(event: PointerEvent): void {
    if (origin && event.pointerId === origin.id) {
      cancel();
    }
  }

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerEnd);
  element.addEventListener("pointercancel", onPointerEnd);
  element.addEventListener("contextmenu", cancel);
  return () => {
    cancel();
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerEnd);
    element.removeEventListener("pointercancel", onPointerEnd);
    element.removeEventListener("contextmenu", cancel);
  };
}
