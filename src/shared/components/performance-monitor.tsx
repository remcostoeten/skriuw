// src/components/fps-meter.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Rating = "good" | "degraded" | "poor";

type State = {
  fps: number;
  delta: number;
  rating: Rating;
};

function rateFrames(fps: number): Rating {
  if (fps >= 55) return "good";
  if (fps >= 30) return "degraded";
  return "poor";
}

const DOT: Record<Rating, string> = {
  good: "bg-foreground/20",
  degraded: "bg-foreground/55",
  poor: "bg-foreground animate-pulse",
};

const NUM: Record<Rating, string> = {
  good: "text-foreground/35",
  degraded: "text-foreground/70",
  poor: "text-foreground",
};

export function FpsMeter() {
  const [state, setState] = useState<State>({ fps: 0, delta: 0, rating: "good" });
  const rafRef = useRef(0);
  const countRef = useRef(0);
  const lastRef = useRef(performance.now());
  const prevRef = useRef(0);

  useEffect(() => {
    let alive = true;

    function tick(now: number): void {
      if (!alive) return;
      countRef.current++;

      const elapsed = now - lastRef.current;
      if (elapsed >= 500) {
        const fps = Math.round((countRef.current * 1000) / elapsed);
        const delta = fps - prevRef.current;
        setState({ fps, delta, rating: rateFrames(fps) });
        prevRef.current = fps;
        countRef.current = 0;
        lastRef.current = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const sign = state.delta > 0 ? "+" : "";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${state.fps} fps, ${state.rating}`}
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1 rounded-md border border-border bg-background px-3 py-2 font-mono"
    >
      <div className="flex items-center gap-2">
        <span className={`size-1.5 rounded-full transition-all duration-300 ${DOT[state.rating]}`} aria-hidden />
        <span className={`text-lg font-medium leading-none transition-colors duration-300 ${NUM[state.rating]}`}>
          {state.fps}
          <span className="ml-1 text-[11px] text-foreground/25">fps</span>
        </span>
      </div>
      <span className="text-[10px] text-foreground/30" aria-hidden>
        {state.fps === 0 ? "—" : `${sign}${state.delta}`}
      </span>
    </div>
  );
}