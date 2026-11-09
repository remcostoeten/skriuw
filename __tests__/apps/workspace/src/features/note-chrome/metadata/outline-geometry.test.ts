import assert from "node:assert/strict";
import { test } from "vitest";
import {
  lengthsAtY,
  pathPoints,
  roundedPath,
  roundedSegments,
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

test("lengths at y on a straight vertical line match the requested y", () => {
  const segments = roundedSegments(
    [
      { x: 0, y: 0 },
      { x: 0, y: 400 },
    ],
    8,
  );
  const { lengths, total } = lengthsAtY(segments, [137, 250]);

  assert.deepEqual(lengths, [137, 250]);
  assert.equal(total, 400);
});

test("lengths at y land on each anchor of a stepped rounded path", () => {
  const { points, anchors } = pathPoints(ROWS);
  const segments = roundedSegments(points, 8);
  const polyline = [segments[0]!.from];
  for (const segment of segments) {
    if (segment.control) {
      for (let step = 1; step <= 64; step += 1) {
        const t = step / 64;
        const inverse = 1 - t;
        polyline.push({
          x:
            inverse * inverse * segment.from.x +
            2 * inverse * t * segment.control.x +
            t * t * segment.to.x,
          y:
            inverse * inverse * segment.from.y +
            2 * inverse * t * segment.control.y +
            t * t * segment.to.y,
        });
      }
    } else {
      polyline.push(segment.to);
    }
  }
  const { sample, total } = polylineSampler(polyline);
  const { lengths, total: computedTotal } = lengthsAtY(
    segments,
    anchors.map((anchor) => points[anchor]!.y),
  );

  assert.ok(Math.abs(computedTotal - total) <= 0.1);
  anchors.forEach((anchor, index) => {
    const expected = points[anchor]!;
    const found = sample(lengths[index]!);
    assert.ok(Math.hypot(found.x - expected.x, found.y - expected.y) <= 1);
  });
});

test("rounded segments rebuild the same path the outline draws", () => {
  const { points } = pathPoints(ROWS);
  const segments = roundedSegments(points, 8);

  assert.equal(segments.at(-1)!.to, points.at(-1));
  assert.equal(segments.filter((segment) => segment.control !== null).length, points.length - 2);
});

test("lengths at y on an empty path are zero", () => {
  assert.deepEqual(lengthsAtY([], [50]), { lengths: [0], total: 0 });
});
