import { useEffect } from "react";
import { loadPromptPlayground, loadSignInDrawer } from "@/app/lazy-surfaces";
import { registerAiSettings } from "@/features/ai/settings";
import { installBackNavigation } from "@/features/references/shell";
import { scheduleSearchIndexReconciliation } from "@/features/search/index-maintenance";
import { useTitleBarDoubleClickMaximize } from "@/shell/title-bar";
import type { AppRoute } from "@skriuw/renderer-core/route/app-route";
import { appRouteHash } from "@skriuw/renderer-core/route/app-route";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

type Options = {
  store: RendererStore;
  route: AppRoute;
  aiEnabled: boolean;
  /** True while a surface that can open sign-in or the AI playground is showing. */
  launcherOpen: boolean;
  openAiSettings(): void;
};

/**
 * Starts the feature services the mounted workspace keeps running: entity back
 * navigation, search index upkeep, the title-bar maximize gesture, the AI
 * settings entry point and route gate, and warming lazy surfaces.
 */
export function useWorkspaceServices({
  store,
  route,
  aiEnabled,
  launcherOpen,
  openAiSettings,
}: Options): void {
  useEffect(() => installBackNavigation(store), [store]);
  useEffect(() => scheduleSearchIndexReconciliation(), []);
  useTitleBarDoubleClickMaximize();
  // Warm the sign-in chunk as soon as either trigger surface opens, so the
  // drawer appears instantly on click instead of waiting on a lazy import.
  useEffect(() => {
    if (launcherOpen) {
      void loadSignInDrawer();
      if (aiEnabled) {
        void loadPromptPlayground();
      }
    }
  }, [aiEnabled, launcherOpen]);
  // The playground route is structurally gated: with AI off it must not exist,
  // so a stale or hand-typed hash lands back on notes instead of a blank shell.
  useEffect(() => {
    if (route === "prompt-playground" && !aiEnabled) {
      window.location.hash = appRouteHash("notes");
    }
  }, [aiEnabled, route]);
  useEffect(() => registerAiSettings(openAiSettings), [openAiSettings]);
}
