import { useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import type { AppCommand } from "@/commands/registry";
import { requestModelSwitcher } from "./model-switcher-controller";

const EMPTY_REGISTRATIONS: readonly never[] = [];

type Props = {
  store: RendererStore;
  children: (signal: AbortSignal) => ReactNode;
};

export function selectAiEnabled(state: RendererState): boolean {
  return state.settings.aiEnabled === true;
}

export function guardAiRegistrations<T>(
  enabled: boolean,
  createRegistrations: () => readonly T[],
): readonly T[] {
  return enabled ? createRegistrations() : EMPTY_REGISTRATIONS;
}

export function aiSettingsCommands(
  enabled: boolean,
  openSettings: () => void,
  openPlayground: () => void,
): readonly AppCommand[] {
  return guardAiRegistrations(enabled, () => [
    {
      id: "open-ai-settings",
      label: "Open AI settings",
      group: "General",
      keywords: ["artificial intelligence", "provider", "model"],
      run: openSettings,
    },
    {
      id: "switch-ai-model",
      label: "Switch AI model",
      group: "General",
      keywords: ["default", "provider", "ollama", "gemini", "groq", "local", "remote"],
      run: requestModelSwitcher,
    },
    {
      id: "open-prompt-playground",
      label: "Open prompt playground",
      group: "Navigation",
      keywords: ["playground", "prompt", "ai", "test", "model", "completion", "stream"],
      visible: (_state, ui) => ui.route !== "prompt-playground",
      run: openPlayground,
    },
  ]);
}

export function AiOptInGate({ store, children }: Props) {
  const enabled = useRendererSelector(store, selectAiEnabled);
  return enabled ? <ActiveAiGate>{children}</ActiveAiGate> : null;
}

function ActiveAiGate({ children }: Pick<Props, "children">) {
  const [controller, setController] = useState<AbortController | null>(null);

  useLayoutEffect(() => {
    const activeController = new AbortController();
    setController(activeController);
    return () => activeController.abort();
  }, []);

  return controller === null ? null : children(controller.signal);
}
