"use client";

import { useSyncExternalStore } from "react";

type Accent = "clay" | "orange";

const listeners = new Set<() => void>();

function read(): Accent {
  if (typeof document === "undefined") {
    return "clay";
  }
  return document.documentElement.dataset.accent === "orange" ? "orange" : "clay";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function write(next: Accent) {
  if (next === "orange") {
    document.documentElement.dataset.accent = "orange";
  } else {
    delete document.documentElement.dataset.accent;
  }
  listeners.forEach((listener) => listener());
}

/** Flips the single accent between Skriuw clay and the scraper's orange. */
export function useAccent() {
  const accent = useSyncExternalStore(subscribe, read, () => "clay" as Accent);

  function toggle() {
    write(accent === "clay" ? "orange" : "clay");
  }

  return { accent, toggle };
}
