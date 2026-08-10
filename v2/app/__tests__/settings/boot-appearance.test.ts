import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { BOOT_APPEARANCE_KEY, writeBootAppearance } from "../../src/settings/boot-appearance";

function storageStub(): { entries: Map<string, string>; setItem: (key: string, value: string) => void } {
  const entries = new Map<string, string>();
  return {
    entries,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

test("appearance attributes round-trip through the boot storage slot", () => {
  const storage = storageStub();
  writeBootAppearance(storage, { theme: "paper", reduceMotion: true });
  assert.deepEqual(JSON.parse(storage.entries.get(BOOT_APPEARANCE_KEY) ?? "null"), {
    theme: "paper",
    reduceMotion: true,
  });
});

test("a failing storage does not propagate out of the mirror", () => {
  assert.doesNotThrow(() => {
    writeBootAppearance(
      {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
      { theme: "midnight", reduceMotion: false },
    );
  });
});

test("the inline bootstrap script reads the key this module writes", () => {
  const html = readFileSync(
    fileURLToPath(new URL("../../index.html", import.meta.url)),
    "utf8",
  );
  assert.ok(html.includes(`"${BOOT_APPEARANCE_KEY}"`));
});
