import { describe, expect, test } from "vitest";
import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/features/settings/settings-model";
import type { JournalEntry } from "@/features/journal/model";
import {
  JOURNAL_WORD_GOAL_SETTING,
  changeWordGoal,
  crossedWordGoalMilestone,
  parseWordGoalInput,
  selectWordGoalHistory,
  wordGoalFraction,
  wordGoalHistory,
  wordGoalOn,
  wordGoalStats,
} from "@/features/journal/word-goal";
import type { RendererState } from "@skriuw/renderer-core/store/types";

function settingsWith(goals: WorkspaceSettings[string]): WorkspaceSettings {
  return { ...DEFAULT_WORKSPACE_SETTINGS, [JOURNAL_WORD_GOAL_SETTING]: goals };
}

function entry(dateKey: string, wordCount: number): JournalEntry {
  return { noteId: `note-${dateKey}`, dateKey, title: dateKey, mood: null, wordCount, tagIds: [] };
}

describe("wordGoalHistory", () => {
  test("is empty and off by default", () => {
    expect(wordGoalHistory(DEFAULT_WORKSPACE_SETTINGS)).toEqual([]);
    expect(wordGoalOn([], "2026-09-29")).toBeNull();
  });

  test("sorts changes and skips malformed ones", () => {
    const history = wordGoalHistory(
      settingsWith([
        { from: "2026-09-10", words: 750 },
        { from: "2026-02-30", words: 500 },
        { from: "2026-09-01", words: 500 },
        { from: "2026-09-05", words: -1 },
        { from: "2026-09-06", words: 2.5 },
        "500",
        null,
      ]),
    );
    expect(history).toEqual([
      { from: "2026-09-01", words: 500 },
      { from: "2026-09-10", words: 750 },
    ]);
  });

  test("reads a non-list value as no history", () => {
    expect(wordGoalHistory(settingsWith(500))).toEqual([]);
  });
});

describe("wordGoalOn", () => {
  const history = [
    { from: "2026-09-01", words: 500 },
    { from: "2026-09-10", words: 0 },
    { from: "2026-09-20", words: 750 },
  ];

  test("applies the latest change on or before the day", () => {
    expect(wordGoalOn(history, "2026-08-31")).toBeNull();
    expect(wordGoalOn(history, "2026-09-01")).toBe(500);
    expect(wordGoalOn(history, "2026-09-09")).toBe(500);
    expect(wordGoalOn(history, "2026-09-15")).toBeNull();
    expect(wordGoalOn(history, "2026-09-20")).toBe(750);
    expect(wordGoalOn(history, "2026-12-01")).toBe(750);
  });
});

describe("changeWordGoal", () => {
  test("starts the goal on today and keeps earlier days on theirs", () => {
    const first = changeWordGoal(DEFAULT_WORKSPACE_SETTINGS, 500, "2026-09-01");
    const second = changeWordGoal(first, 750, "2026-09-20");
    expect(wordGoalHistory(second)).toEqual([
      { from: "2026-09-01", words: 500 },
      { from: "2026-09-20", words: 750 },
    ]);
  });

  test("replaces a change made earlier the same day", () => {
    const first = changeWordGoal(DEFAULT_WORKSPACE_SETTINGS, 500, "2026-09-01");
    const second = changeWordGoal(first, 250, "2026-09-01");
    expect(wordGoalHistory(second)).toEqual([{ from: "2026-09-01", words: 250 }]);
  });

  test("drops a same-day change that restores the previous goal", () => {
    const first = changeWordGoal(DEFAULT_WORKSPACE_SETTINGS, 500, "2026-09-01");
    const second = changeWordGoal(first, 750, "2026-09-20");
    const third = changeWordGoal(second, 500, "2026-09-20");
    expect(wordGoalHistory(third)).toEqual([{ from: "2026-09-01", words: 500 }]);
  });

  test("returns the same settings when nothing changes", () => {
    expect(changeWordGoal(DEFAULT_WORKSPACE_SETTINGS, 0, "2026-09-01")).toBe(
      DEFAULT_WORKSPACE_SETTINGS,
    );
    const set = changeWordGoal(DEFAULT_WORKSPACE_SETTINGS, 500, "2026-09-01");
    expect(changeWordGoal(set, 500, "2026-09-12")).toBe(set);
  });

  test("turning the goal off keeps the history", () => {
    const set = changeWordGoal(DEFAULT_WORKSPACE_SETTINGS, 500, "2026-09-01");
    const off = changeWordGoal(set, 0, "2026-09-12");
    const history = wordGoalHistory(off);
    expect(wordGoalOn(history, "2026-09-11")).toBe(500);
    expect(wordGoalOn(history, "2026-09-12")).toBeNull();
  });

  test("forgets changes dated after today", () => {
    const future = settingsWith([{ from: "2026-10-01", words: 500 }]);
    expect(wordGoalHistory(changeWordGoal(future, 250, "2026-09-01"))).toEqual([
      { from: "2026-09-01", words: 250 },
    ]);
  });

  test("keeps the settings version and other keys", () => {
    const next = changeWordGoal(DEFAULT_WORKSPACE_SETTINGS, 500, "2026-09-01");
    expect(next.settingsVersion).toBe(DEFAULT_WORKSPACE_SETTINGS.settingsVersion);
    expect(next.theme).toBe(DEFAULT_WORKSPACE_SETTINGS.theme);
  });
});

describe("parseWordGoalInput", () => {
  test("accepts whole numbers in range", () => {
    expect(parseWordGoalInput(" 1200 ")).toBe(1200);
    expect(parseWordGoalInput("1")).toBe(1);
  });

  test("rejects everything else", () => {
    for (const text of ["", "0", "-5", "12.5", "abc", "1e3", "100001"]) {
      expect(parseWordGoalInput(text)).toBeNull();
    }
  });
});

describe("progress", () => {
  test("clamps the fraction", () => {
    expect(wordGoalFraction(250, 500)).toBe(0.5);
    expect(wordGoalFraction(900, 500)).toBe(1);
    expect(wordGoalFraction(0, 500)).toBe(0);
  });

  test("announces only when a milestone is crossed upward", () => {
    expect(crossedWordGoalMilestone(240, 260, 500)).toBe("halfway");
    expect(crossedWordGoalMilestone(260, 300, 500)).toBeNull();
    expect(crossedWordGoalMilestone(480, 510, 500)).toBe("reached");
    expect(crossedWordGoalMilestone(100, 600, 500)).toBe("reached");
    expect(crossedWordGoalMilestone(510, 490, 500)).toBeNull();
    expect(crossedWordGoalMilestone(490, 520, 500)).toBe("reached");
    expect(crossedWordGoalMilestone(520, 530, 500)).toBeNull();
  });
});

describe("wordGoalStats", () => {
  const history = [
    { from: "2026-09-01", words: 500 },
    { from: "2026-09-25", words: 750 },
  ];

  test("measures each day against the goal that applied on it", () => {
    const stats = wordGoalStats(
      [
        entry("2026-08-30", 2000),
        entry("2026-09-24", 600),
        entry("2026-09-25", 600),
        entry("2026-09-26", 800),
      ],
      history,
      "2026-09-26",
    );
    expect([...stats.metDates].sort()).toEqual(["2026-09-24", "2026-09-26"]);
    expect(stats.metDays).toBe(2);
    expect(stats.streak).toBe(1);
  });

  test("the streak runs through yesterday while today is unmet", () => {
    const stats = wordGoalStats(
      [entry("2026-09-27", 520), entry("2026-09-28", 510), entry("2026-09-29", 20)],
      [{ from: "2026-09-01", words: 500 }],
      "2026-09-29",
    );
    expect(stats.streak).toBe(2);
  });

  test("a gap breaks the streak", () => {
    const stats = wordGoalStats(
      [entry("2026-09-26", 520), entry("2026-09-28", 510), entry("2026-09-29", 600)],
      [{ from: "2026-09-01", words: 500 }],
      "2026-09-29",
    );
    expect(stats.streak).toBe(2);
    expect(stats.metDays).toBe(3);
  });
});

describe("selectWordGoalHistory", () => {
  test("reuses the parsed list while the setting keeps its identity", () => {
    const settings = settingsWith([{ from: "2026-09-01", words: 500 }]);
    const state = { settings } as RendererState;
    const first = selectWordGoalHistory(state);
    expect(selectWordGoalHistory({ settings: { ...settings } } as RendererState)).toBe(first);
    expect(first).toEqual([{ from: "2026-09-01", words: 500 }]);
    const changed = settingsWith([{ from: "2026-09-02", words: 250 }]);
    expect(selectWordGoalHistory({ settings: changed } as RendererState)).not.toBe(first);
  });
});
