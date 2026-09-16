import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type Phase = "idle" | "holding" | "hint";

type Props = {
  ariaLabel: string;
  onConfirm: () => void;
  /** Keyboard activation has no hold gesture, so it hands off to a tap-to-confirm step. */
  onKeyboardActivate: () => void;
  children: ReactNode;
  className?: string;
  holdLabel?: string;
  holdingLabel?: string;
  durationMs?: number;
};

const RELEASE_TRANSITION = "clip-path 200ms cubic-bezier(0.23, 1, 0.32, 1)";
const HINT_MS = 1600;
const TAP_MS = 180;

/**
 * Destructive trigger for touch: pressing fills the button left to right and
 * fires once the fill completes. Releasing early drains it; a quick tap shows
 * a "hold" hint instead of acting, so a stray touch never deletes anything.
 */
export function HoldToConfirm({
  ariaLabel,
  onConfirm,
  onKeyboardActivate,
  children,
  className,
  holdLabel = "Hold to delete",
  holdingLabel = "Keep holding",
  durationMs = 900,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const holdTimer = useRef<number | null>(null);
  const hintTimer = useRef<number | null>(null);
  const pressedAt = useRef(0);

  useEffect(
    () => () => {
      clearTimer(holdTimer);
      clearTimer(hintTimer);
    },
    [],
  );

  function clearTimer(timer: { current: number | null }): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function release(): void {
    if (holdTimer.current === null) {
      return;
    }
    clearTimer(holdTimer);
    if (performance.now() - pressedAt.current < TAP_MS) {
      setPhase("hint");
      hintTimer.current = window.setTimeout(() => setPhase("idle"), HINT_MS);
      return;
    }
    setPhase("idle");
  }

  const holding = phase === "holding";
  const label = holding ? holdingLabel : phase === "hint" ? holdLabel : null;

  return (
    <span className="relative inline-flex">
      <span
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute right-0 top-full z-10 mt-1.5 whitespace-nowrap text-[12px] font-[560] text-muted-foreground",
          "transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:translate-y-0 motion-reduce:transition-opacity",
          label === null ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        {label}
      </span>
      <button
        type="button"
        aria-label={ariaLabel}
        data-holding={holding ? "" : undefined}
        className={cn(
          "relative isolate touch-manipulation select-none overflow-hidden [-webkit-touch-callout:none]",
          className,
          "transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-holding:scale-[0.97] motion-reduce:data-holding:scale-100",
        )}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          clearTimer(hintTimer);
          pressedAt.current = performance.now();
          setPhase("holding");
          holdTimer.current = window.setTimeout(() => {
            holdTimer.current = null;
            setPhase("idle");
            navigator.vibrate?.(12);
            onConfirm();
          }, durationMs);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onClick={(event) => {
          if (event.detail === 0) {
            onKeyboardActivate();
          }
        }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-destructive/25"
          style={{
            clipPath: holding ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
            transition: holding ? `clip-path ${durationMs}ms linear` : RELEASE_TRANSITION,
          }}
        />
        {children}
      </button>
    </span>
  );
}
