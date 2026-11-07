import assert from "node:assert/strict";
import { test } from "vitest";
import { clamp, projectVelocity } from "@/shell/motion";

test("a drag projects further the faster it was released", () => {
  assert.equal(projectVelocity(0), 0);
  assert.ok(projectVelocity(1500) > projectVelocity(500));
  assert.ok(projectVelocity(-1500) < 0);
});

test("a velocity projects the same distance in either direction", () => {
  assert.equal(projectVelocity(-800), -projectVelocity(800));
});

test("clamp pins a value inside its bounds", () => {
  assert.equal(clamp(-0.2, 0, 1), 0);
  assert.equal(clamp(0.4, 0, 1), 0.4);
  assert.equal(clamp(1.7, 0, 1), 1);
});
