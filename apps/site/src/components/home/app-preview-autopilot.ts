import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";

export type CursorState = {
  x: number;
  y: number;
  visible: boolean;
  pressed: boolean;
  clicks: number;
};

export const idleCursor: CursorState = {
  x: 0,
  y: 0,
  visible: false,
  pressed: false,
  clicks: 0,
};

const abortError = new DOMException("Autopilot aborted", "AbortError");

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Resolves after `ms`, or rejects the moment `signal` aborts so a running
 * script unwinds immediately instead of finishing its current pause.
 */
export function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError);
      return;
    }
    function onAbort() {
      clearTimeout(timer);
      reject(abortError);
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function jitter(base: number, spread: number) {
  return base + Math.random() * spread;
}

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readServerReducedMotion() {
  return true;
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, readServerReducedMotion);
}

export function useInView(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

type ScriptRunner = (signal: AbortSignal) => Promise<void>;

/**
 * Runs `script` on a loop while `enabled` is true. Flipping `enabled` off
 * aborts the in-flight run and calls `onStop` so transient overlays can be
 * cleared; flipping it back on starts the script from the top.
 */
export function useAutopilot(script: ScriptRunner, enabled: boolean, onStop: () => void) {
  const scriptRef = useRef(script);
  const onStopRef = useRef(onStop);
  scriptRef.current = script;
  onStopRef.current = onStop;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;

    async function loop() {
      try {
        while (!signal.aborted) {
          await scriptRef.current(signal);
        }
      } catch (error) {
        if (!isAbort(error)) console.error(error);
      }
    }

    loop();
    return () => {
      controller.abort();
      onStopRef.current();
    };
  }, [enabled]);
}

export function usePauseOnInteraction(resumeAfterMs: number) {
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pause() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPaused(true);
  }

  function scheduleResume() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPaused(false), resumeAfterMs);
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { paused, pause, scheduleResume };
}

export function centerOf(target: Element, container: Element) {
  const box = target.getBoundingClientRect();
  const frame = container.getBoundingClientRect();
  return {
    x: box.left - frame.left + box.width / 2,
    y: box.top - frame.top + box.height / 2,
  };
}
