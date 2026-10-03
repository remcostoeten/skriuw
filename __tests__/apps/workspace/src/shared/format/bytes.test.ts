import assert from "node:assert/strict";
import { test } from "vitest";
import { formatSizeBytes } from "@/shared/format/bytes";

test("byte sizes format into readable units", () => {
  assert.equal(formatSizeBytes(512), "512 B");
  assert.equal(formatSizeBytes(2048), "2.0 KB");
  assert.equal(formatSizeBytes(5 * 1024 * 1024), "5.0 MB");
});
