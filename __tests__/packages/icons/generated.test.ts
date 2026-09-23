import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { test } from "vitest";
import { renderIconData } from "../../../packages/icons/render-data";

test("committed icon data matches the generator's output", () => {
  for (const [path, expected] of renderIconData()) {
    assert.equal(
      readFileSync(path, "utf8"),
      expected,
      `${relative(process.cwd(), path)} is stale: run \`bun packages/icons/generate.ts\``,
    );
  }
});
