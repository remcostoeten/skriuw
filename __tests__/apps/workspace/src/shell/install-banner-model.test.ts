import assert from "node:assert/strict";
import { test } from "vitest";
import { clearSkriuwLocalState } from "@/bridge/local-state";
import {
  installBannerVisible,
  readInstallBannerDismissed,
  rememberInstallBannerDismissed,
} from "@/shell/install-banner-model";

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

function throwingStorage(): Storage {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  } as unknown as Storage;
}

test("the strip shows only on a phone that holds an install offer and has not dismissed it", () => {
  assert.equal(installBannerVisible({ compact: true, offered: true, dismissed: false }), true);
  assert.equal(installBannerVisible({ compact: false, offered: true, dismissed: false }), false);
  assert.equal(installBannerVisible({ compact: true, offered: false, dismissed: false }), false);
  assert.equal(installBannerVisible({ compact: true, offered: true, dismissed: true }), false);
});

test("a dismissal is remembered for the profile", () => {
  const storage = memoryStorage();
  assert.equal(readInstallBannerDismissed(storage), false);
  rememberInstallBannerDismissed(storage);
  assert.equal(readInstallBannerDismissed(storage), true);
});

test("the dismissal key is cleared with the rest of the renderer state", () => {
  const storage = memoryStorage();
  rememberInstallBannerDismissed(storage);
  clearSkriuwLocalState(storage);
  assert.equal(readInstallBannerDismissed(storage), false);
});

test("a blocked storage neither hides the strip forever nor throws", () => {
  const storage = throwingStorage();
  assert.equal(readInstallBannerDismissed(storage), false);
  assert.doesNotThrow(() => rememberInstallBannerDismissed(storage));
});
