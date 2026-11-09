import { lazy } from "react";
import { preloadMermaidRenderer } from "@/features/editor/diagrams";
import { preloadMathRenderer } from "@/features/editor/math";

export function loadSignInDrawer() {
  return import("@/features/auth/sign-in-drawer");
}

export function loadPromptPlayground() {
  return import("@/features/ai/prompt-playground");
}

export const CloudSignInDrawer = lazy(async () => {
  const module = await loadSignInDrawer();
  return { default: module.CloudSignInDrawer };
});

export const ModelSwitcherHost = lazy(async () => {
  const module = await import("@/features/ai/model-switcher");
  return { default: module.ModelSwitcherHost };
});

export const PromptPlaygroundView = lazy(async () => {
  const module = await loadPromptPlayground();
  return { default: module.PromptPlaygroundView };
});

/**
 * @name warmEditorRenderers
 * @description Starts loading the KaTeX and Mermaid chunks right after the
 * first commit, so they finish during startup and opening a note with math or
 * a diagram never waits on a chunk.
 *
 * @example
 * useEffect(() => warmEditorRenderers(), []);
 */
export function warmEditorRenderers(): void {
  preloadMathRenderer();
  preloadMermaidRenderer();
}
