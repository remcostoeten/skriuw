import assert from "node:assert/strict";
import { test } from "vitest";
import { currentStreak } from "@/features/journal/history/streak";

test("a streak counts consecutive days ending today", () => {
  const dates = new Set(["2026-03-08", "2026-03-09", "2026-03-10"]);
  assert.equal(currentStreak(dates, "2026-03-10"), 3);
});

test("an unwritten today keeps the streak that ended yesterday", () => {
  const dates = new Set(["2026-03-08", "2026-03-09"]);
  assert.equal(currentStreak(dates, "2026-03-10"), 2);
});

test("a gap before yesterday ends the streak", () => {
  assert.equal(currentStreak(new Set(["2026-03-07"]), "2026-03-10"), 0);
  assert.equal(currentStreak(new Set<string>(), "2026-03-10"), 0);
});
