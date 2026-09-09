import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COVER_GRADIENTS,
  coverGradientCss,
  isCoverGradientId,
} from "@/features/note-chrome/cover-gradient-model";

test("every gradient carries a distinct id and paint", () => {
  const ids = new Set(COVER_GRADIENTS.map((gradient) => gradient.id));
  const paints = new Set(COVER_GRADIENTS.map((gradient) => gradient.css));
  assert.equal(ids.size, COVER_GRADIENTS.length);
  assert.equal(paints.size, COVER_GRADIENTS.length);
  for (const gradient of COVER_GRADIENTS) {
    assert.ok(gradient.label.length > 0);
    assert.ok(isCoverGradientId(gradient.id));
  }
});

test("the gradient ids match the domain allow-list", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("../../../../crates/skriuw-domain/src/lib.rs", import.meta.url),
    ),
    "utf8",
  );
  const declaration = source.match(
    /pub const COVER_GRADIENT_IDS: \[&str; \d+\] = \[([^\]]*)\]/,
  );
  assert.ok(declaration, "the domain still declares COVER_GRADIENT_IDS");
  const domainIds = [...declaration[1].matchAll(/"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    COVER_GRADIENTS.map((gradient) => gradient.id),
    domainIds,
  );
});

test("an unrecognised gradient resolves to no paint", () => {
  assert.equal(coverGradientCss(null), null);
  assert.equal(coverGradientCss(undefined), null);
  assert.equal(coverGradientCss("ocean"), coverGradientCss("ocean"));
  assert.notEqual(coverGradientCss("ocean"), null);
  assert.equal(coverGradientCss("url(https://example.com/x.png)"), null);
  assert.equal(coverGradientCss("from-a-newer-build"), null);
  assert.equal(isCoverGradientId("from-a-newer-build"), false);
});
