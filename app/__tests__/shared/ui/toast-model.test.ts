import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_VISIBLE_TOASTS,
  TOAST_DURATION_MS,
  addToast,
  removeToast,
  toastDuration,
  type Toast,
} from "../../../src/shared/ui/toast-model";

function toast(id: number, durationMs?: number): Toast {
  return { id, message: `toast ${id}`, ...(durationMs === undefined ? {} : { durationMs }) };
}

test("adding toasts keeps the newest ones and drops the overflow", () => {
  let toasts: Toast[] = [];
  for (let id = 1; id <= MAX_VISIBLE_TOASTS + 2; id += 1) {
    toasts = addToast(toasts, toast(id));
  }
  assert.equal(toasts.length, MAX_VISIBLE_TOASTS);
  assert.deepEqual(
    toasts.map((entry) => entry.id),
    [3, 4, 5],
  );
});

test("removing a toast leaves the rest in order", () => {
  const toasts = addToast(addToast([], toast(1)), toast(2));
  assert.deepEqual(
    removeToast(toasts, 1).map((entry) => entry.id),
    [2],
  );
  assert.deepEqual(removeToast(toasts, 99), toasts);
});

test("duration falls back to the shared default", () => {
  assert.equal(toastDuration(toast(1)), TOAST_DURATION_MS);
  assert.equal(toastDuration(toast(1, 1200)), 1200);
});
