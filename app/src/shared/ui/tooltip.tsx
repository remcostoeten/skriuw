import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FocusEvent, PointerEvent, ReactElement, ReactNode } from "react";
import {
  computeTooltipPlacement,
  resolveOpenTiming,
  type TooltipSide,
} from "./tooltip-model";

const OPEN_DELAY_MS = 350;
const SKIP_DELAY_MS = 300;
const CLOSE_DURATION_MS = 100;

let lastCloseAt = 0;

type TooltipState = "closed" | "delayed-open" | "instant-open" | "closing";

type TriggerProps = {
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
  "aria-describedby"?: string;
};

type TooltipProps = {
  label: ReactNode;
  shortcut?: ReactNode;
  side?: TooltipSide;
  sideOffset?: number;
  collisionPadding?: number;
  children: ReactElement<TriggerProps>;
};

/**
 * Dependency-free tooltip primitive. Renders nothing while closed (no portal,
 * no timers, no listeners), measures once per open before paint, and animates
 * only compositor-friendly opacity/transform. Skip-delay is shared across all
 * instances: moving between triggers within a short window opens the next
 * tooltip instantly with no entry animation, so hovering along an icon rail
 * feels continuous. Honors reduced motion via CSS.
 */
export function Tooltip({
  label,
  shortcut,
  side = "top",
  sideOffset = 6,
  collisionPadding = 8,
  children,
}: TooltipProps) {
  const [state, setState] = useState<TooltipState>("closed");
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const id = useId();
  const visible = state !== "closed";
  const open = state === "delayed-open" || state === "instant-open";

  function cancelTimers() {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }

  function beginClose() {
    cancelTimers();
    setState((current) => {
      if (current === "closed" || current === "closing") {
        return current;
      }
      lastCloseAt = Date.now();
      closeTimer.current = window.setTimeout(() => setState("closed"), CLOSE_DURATION_MS);
      return "closing";
    });
  }

  function beginOpen(trigger: HTMLElement) {
    cancelTimers();
    triggerRef.current = trigger;
    const timing = resolveOpenTiming(Date.now(), lastCloseAt, OPEN_DELAY_MS, SKIP_DELAY_MS);
    if (timing.waitMs === 0) {
      setState(timing.state);
      return;
    }
    openTimer.current = window.setTimeout(() => setState(timing.state), timing.waitMs);
  }

  useEffect(() => cancelTimers, []);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!open || !trigger || !tooltip) {
      return;
    }
    const placement = computeTooltipPlacement({
      trigger: trigger.getBoundingClientRect(),
      tooltip: { width: tooltip.offsetWidth, height: tooltip.offsetHeight },
      side,
      sideOffset,
      collisionPadding,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    tooltip.style.left = `${placement.left}px`;
    tooltip.style.top = `${placement.top}px`;
    tooltip.dataset.side = placement.side;
  }, [open, side, sideOffset, collisionPadding]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const dismiss = () => beginClose();
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        beginClose();
      }
    };
    window.addEventListener("keydown", dismissOnEscape);
    window.addEventListener("scroll", dismiss, { capture: true, passive: true });
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("scroll", dismiss, { capture: true });
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const childProps = children.props;
  const trigger = cloneElement(children, {
    "aria-describedby": open ? id : childProps["aria-describedby"],
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      childProps.onPointerEnter?.(event);
      if (event.pointerType !== "touch") {
        beginOpen(event.currentTarget);
      }
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      childProps.onPointerLeave?.(event);
      beginClose();
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      childProps.onPointerDown?.(event);
      cancelTimers();
      setState("closed");
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(event);
      if (event.currentTarget.matches(":focus-visible")) {
        triggerRef.current = event.currentTarget;
        setState("instant-open");
      }
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(event);
      beginClose();
    },
  });

  return (
    <>
      {trigger}
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            id={id}
            role="tooltip"
            className="tooltip"
            data-state={state}
            data-side={side}
          >
            {shortcut ? (
              <span className="tooltip-inner">
                <span className="tooltip-label">{label}</span>
                <kbd className="tooltip-shortcut">{shortcut}</kbd>
              </span>
            ) : (
              label
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
