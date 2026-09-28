import assert from "node:assert/strict";
import { test } from "vitest";
import {
  readNudgeProgress,
  recordNudgeAction,
  rememberNudgeProgress,
  type NudgeProgress,
} from "@/features/auth/sign-in-nudge-model";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

function dueActions(count: number): number[] {
  let progress: NudgeProgress = readNudgeProgress(memoryStorage());
  const due: number[] = [];
  for (let action = 1; action <= count; action += 1) {
    const step = recordNudgeAction(progress);
    progress = step.progress;
    if (step.due) due.push(action);
  }
  return due;
}

test("the first nudge comes after five actions, then every fifteen", () => {
  assert.deepEqual(dueActions(40), [5, 20, 35]);
});

test("progress survives a reload", () => {
  const storage = memoryStorage();
  rememberNudgeProgress({ actions: 7, nextAt: 20 }, storage);
  assert.deepEqual(readNudgeProgress(storage), { actions: 7, nextAt: 20 });
});

test("unreadable progress starts fresh", () => {
  const storage = memoryStorage();
  storage.setItem("skriuw.sign-in-nudge.v1", "garbage");
  assert.deepEqual(readNudgeProgress(storage), { actions: 0, nextAt: 5 });
});
