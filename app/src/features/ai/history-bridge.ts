import type { AiHistorySettings, AiHistoryView, AiRunFilter } from "@/contracts/ai";
import { invoke, requireDesktopRuntime } from "@/bridge/runtime";

export function loadAiHistory(filter: AiRunFilter, sinceMs: number): Promise<AiHistoryView> {
  requireDesktopRuntime("AI usage history");
  return invoke<AiHistoryView>("ai_run_history", { filter, sinceMs });
}

export function saveAiHistorySettings(
  settings: AiHistorySettings,
): Promise<AiHistorySettings> {
  requireDesktopRuntime("AI usage history");
  return invoke<AiHistorySettings>("set_ai_history_settings", { settings });
}

export function clearAiRunHistory(): Promise<number> {
  requireDesktopRuntime("AI usage history");
  return invoke<number>("clear_ai_run_history");
}
