import assert from "node:assert/strict";
import { test } from "vitest";
import {
  browserStorageNoticeVisible,
  readBrowserStorageNoticeDismissed,
  rememberBrowserStorageNoticeDismissed,
} from "@/shell/browser-storage-notice-model";

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

const visible = { browser: true, signedIn: false, pending: false, dismissed: false };

test("the notice shows only for a signed-out browser workspace", () => {
  assert.equal(browserStorageNoticeVisible(visible), true);
  assert.equal(browserStorageNoticeVisible({ ...visible, browser: false }), false);
  assert.equal(browserStorageNoticeVisible({ ...visible, signedIn: true }), false);
});

test("the notice waits for the session check and respects a dismissal", () => {
  assert.equal(browserStorageNoticeVisible({ ...visible, pending: true }), false);
  assert.equal(browserStorageNoticeVisible({ ...visible, dismissed: true }), false);
});

test("a dismissal is remembered for the profile", () => {
  const storage = memoryStorage();
  assert.equal(readBrowserStorageNoticeDismissed(storage), false);
  rememberBrowserStorageNoticeDismissed(storage);
  assert.equal(readBrowserStorageNoticeDismissed(storage), true);
});
