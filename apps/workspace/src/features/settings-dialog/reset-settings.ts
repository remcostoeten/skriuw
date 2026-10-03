import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { todayKey } from "@skriuw/renderer-core/journal/dates";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/features/settings/settings-model";
import { updateSettings } from "@/store/settings";
import {
  JOURNAL_WORD_GOAL_SETTING,
  changeWordGoal,
  wordGoalHistory,
} from "@/features/journal/word-goal";

const LIFECYCLE_SETTING_KEYS = [
  "noteTemplateIds",
  "savedSearches",
  "onboardingVersion",
  "starterSeedVersion",
  "starterSeedNoteIds",
  "starterSeedAt",
] as const;

/**
 * First-run bookkeeping is workspace lifecycle, not a preference, so resetting
 * preferences must not replay onboarding or re-seed the preview notes. The
 * journal word goal turns off from today while earlier days keep theirs.
 */
export function resetAllSettings(store: RendererStore): void {
  const current = store.getState().settings;
  const reset = {
    ...DEFAULT_WORKSPACE_SETTINGS,
    ...preservedLifecycle(current),
    ...preservedWordGoals(current),
  };
  updateSettings(store, changeWordGoal(reset, 0, todayKey()));
}

function preservedWordGoals(settings: WorkspaceSettings): Partial<WorkspaceSettings> {
  const history = wordGoalHistory(settings);
  return history.length === 0 ? {} : { [JOURNAL_WORD_GOAL_SETTING]: history };
}

function preservedLifecycle(settings: WorkspaceSettings): Partial<WorkspaceSettings> {
  const preserved: Record<string, unknown> = {};
  for (const key of LIFECYCLE_SETTING_KEYS) {
    if (settings[key] !== undefined) {
      preserved[key] = settings[key];
    }
  }
  return preserved;
}
