import assert from "node:assert/strict";
import { test } from "vitest";
import {
  lengthAtY,
  pathPoints,
  roundedPath,
  type Point,
} from "@/features/note-chrome/metadata/outline-geometry";

const ROWS = [
  { depth: 0, top: 0, height: 30 },
  { depth: 1, top: 32, height: 30 },
  { depth: 0, top: 64, height: 30 },
];

function polylineSampler(points: Point[]): { sample: (length: number) => Point; total: number } {
  const offsets = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    offsets.push(offsets.at(-1)! + Math.hypot(current.x - previous.x, current.y - previous.y));
  }
  const total = offsets.at(-1)!;

  function sample(length: number): Point {
    const clamped = Math.max(0, Math.min(total, length));
    for (let index = 1; index < points.length; index += 1) {
      const segmentEnd = offsets[index]!;
      if (clamped <= segmentEnd) {
        const segmentStart = offsets[index - 1]!;
        const span = segmentEnd - segmentStart;
        const ratio = span === 0 ? 0 : (clamped - segmentStart) / span;
        const from = points[index - 1]!;
        const to = points[index]!;
        return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      }
    }
    return points.at(-1)!;
  }

  return { sample, total };
}

test("path points keep anchors in order and bridge only where depth changes", () => {
  const { points, anchors } = pathPoints(ROWS);

  assert.equal(anchors.length, 3);
  assert.equal(points.length, 1 + 3 + 2 * 2);
  for (let index = 1; index < anchors.length; index += 1) {
    assert.ok(points[anchors[index]!]!.y > points[anchors[index - 1]!]!.y);
  }

  const sameDepth = pathPoints([
    { depth: 0, top: 0, height: 30 },
    { depth: 0, top: 32, height: 30 },
  ]);
  assert.equal(sameDepth.points.length, 3);
});

test("rounded path is empty below two points and starts with a move", () => {
  assert.equal(roundedPath([], 8), "");
  assert.equal(roundedPath([{ x: 0, y: 0 }], 8), "");
  assert.ok(roundedPath(pathPoints(ROWS).points, 8).startsWith("M "));
});

test("length at y on a straight vertical line matches the requested y", () => {
  const length = lengthAtY((at) => ({ x: 0, y: at }), 400, 137);

  assert.ok(Math.abs(length - 137) <= 0.25);
});

test("length at y lands on each anchor of a stepped path", () => {
  const { points, anchors } = pathPoints(ROWS);
  const { sample, total } = polylineSampler(points);

  for (const anchor of anchors) {
    const expected = points[anchor]!;
    const found = sample(lengthAtY(sample, total, expected.y));
    assert.ok(Math.hypot(found.x - expected.x, found.y - expected.y) <= 1);
  }
});

test("length at y on an empty path is zero", () => {
  assert.equal(
    lengthAtY(() => ({ x: 0, y: 0 }), 0, 50),
    0,
  );
});
