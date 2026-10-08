import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { test } from "vitest";
import { renderSettingsSearchCopy } from "../../../../../apps/workspace/scripts/settings-search/render";

test("committed settings search copy matches the generator's output", () => {
  const [path, expected] = renderSettingsSearchCopy();
  assert.equal(
    readFileSync(path, "utf8"),
    expected,
    `${relative(process.cwd(), path)} is stale: run \`bun apps/workspace/scripts/settings-search/generate.ts\``,
  );
});
