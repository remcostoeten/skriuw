import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { repositoryPath } from "../../../../../support/paths";
import { BOOT_APPEARANCE_KEY, writeBootAppearance } from "@/features/settings/boot-appearance";

function storageStub(): {
  entries: Map<string, string>;
  setItem: (key: string, value: string) => void;
} {
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
  writeBootAppearance(storage, {
    theme: "paper",
    colorScheme: "light",
  });
  assert.deepEqual(JSON.parse(storage.entries.get(BOOT_APPEARANCE_KEY) ?? "null"), {
    theme: "paper",
    colorScheme: "light",
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
      { theme: "midnight", colorScheme: "dark" },
    );
  });
});

test("the inline bootstrap script reads the key this module writes", () => {
  const html = readFileSync(repositoryPath("apps/workspace/index.html"), "utf8");
  assert.ok(html.includes(`"${BOOT_APPEARANCE_KEY}"`));
});
