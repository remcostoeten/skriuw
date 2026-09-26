export type TooltipSide = "top" | "right" | "bottom" | "left";

export type TooltipOpenState = "delayed-open" | "instant-open";

type Rect = { top: number; left: number; width: number; height: number };

type Size = { width: number; height: number };

type PlacementInput = {
  trigger: Rect;
  tooltip: Size;
  side: TooltipSide;
  sideOffset: number;
  collisionPadding: number;
  viewport: Size;
};

export type TooltipPlacement = { left: number; top: number; side: TooltipSide };

const OPPOSITE_SIDE: Record<TooltipSide, TooltipSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function fitsOnSide(input: PlacementInput, side: TooltipSide): boolean {
  const { trigger, tooltip, sideOffset, collisionPadding, viewport } = input;
  switch (side) {
    case "top":
      return trigger.top - sideOffset - tooltip.height >= collisionPadding;
    case "bottom":
      return (
        trigger.top + trigger.height + sideOffset + tooltip.height <=
        viewport.height - collisionPadding
      );
    case "left":
      return trigger.left - sideOffset - tooltip.width >= collisionPadding;
    case "right":
      return (
        trigger.left + trigger.width + sideOffset + tooltip.width <=
        viewport.width - collisionPadding
      );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Places a tooltip against a trigger rect. Flips to the opposite side when the
 * requested side overflows the viewport (and the opposite side fits), then
 * clamps the cross axis inside the viewport with `collisionPadding` breathing
 * room. Pure so placement is unit-testable without a DOM.
 */
export function computeTooltipPlacement(input: PlacementInput): TooltipPlacement {
  const { trigger, tooltip, sideOffset, collisionPadding, viewport } = input;
  const side =
    fitsOnSide(input, input.side) || !fitsOnSide(input, OPPOSITE_SIDE[input.side])
      ? input.side
      : OPPOSITE_SIDE[input.side];

  const centeredLeft = trigger.left + trigger.width / 2 - tooltip.width / 2;
  const centeredTop = trigger.top + trigger.height / 2 - tooltip.height / 2;
  const maxLeft = viewport.width - tooltip.width - collisionPadding;
  const maxTop = viewport.height - tooltip.height - collisionPadding;

  switch (side) {
    case "top":
      return {
        side,
        left: clamp(centeredLeft, collisionPadding, maxLeft),
        top: trigger.top - sideOffset - tooltip.height,
      };
    case "bottom":
      return {
        side,
        left: clamp(centeredLeft, collisionPadding, maxLeft),
        top: trigger.top + trigger.height + sideOffset,
      };
    case "left":
      return {
        side,
        left: trigger.left - sideOffset - tooltip.width,
        top: clamp(centeredTop, collisionPadding, maxTop),
      };
    case "right":
      return {
        side,
        left: trigger.left + trigger.width + sideOffset,
        top: clamp(centeredTop, collisionPadding, maxTop),
      };
  }
}

export type TooltipOpenTiming = { waitMs: number; state: TooltipOpenState };

/**
 * Decides how a tooltip should open. Within `skipDelayMs` of another tooltip
 * closing, the next one opens immediately and without an entry animation, so
 * sweeping the pointer along an icon rail feels like one continuous tooltip
 * instead of a chain of delayed pop-ins.
 */
export function resolveOpenTiming(
  now: number,
  lastCloseAt: number,
  delayMs: number,
  skipDelayMs: number,
): TooltipOpenTiming {
  if (lastCloseAt > 0 && now - lastCloseAt <= skipDelayMs) {
    return { waitMs: 0, state: "instant-open" };
  }
  return { waitMs: delayMs, state: "delayed-open" };
}
