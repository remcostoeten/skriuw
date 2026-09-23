"use client";

import { useEffect, useState } from "react";
import { noop } from "@skriuw/shared/helpers/noop";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const themeStorageKey = "skriuw-theme";

function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** The stored preference, or `system` when the visitor never chose one. */
export function readStoredChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(themeStorageKey);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function prefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolves `system` against the OS setting and stamps the result on `<html>`. */
export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved: ResolvedTheme = choice === "system" ? (prefersDark() ? "dark" : "light") : choice;

  document.documentElement.dataset.theme = resolved;

  return resolved;
}

function storeChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") {
      localStorage.removeItem(themeStorageKey);
    } else {
      localStorage.setItem(themeStorageKey, choice);
    }
  } catch {
    noop();
  }
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  useEffect(() => {
    setChoice(readStoredChoice());
    setResolved(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (choice !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      setResolved(applyTheme("system"));
    }

    media.addEventListener("change", onChange);

    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  function select(next: ThemeChoice) {
    setChoice(next);
    setResolved(applyTheme(next));
    storeChoice(next);
  }

  return { choice, resolved, select };
}
