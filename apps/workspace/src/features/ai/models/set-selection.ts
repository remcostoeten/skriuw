import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { updateSettings } from "@/store/settings";
import { changeAiModelSelection, type AiModelSelection } from "./selection";

export function setAiModelSelection(
  store: RendererStore,
  selection: AiModelSelection | null,
): void {
  const current = store.getState().settings;
  const settings = changeAiModelSelection(current, selection);
  if (settings === current) {
    return;
  }
  updateSettings(store, settings);
}
