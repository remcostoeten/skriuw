import { lazy } from "react";

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
