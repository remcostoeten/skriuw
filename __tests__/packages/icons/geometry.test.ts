import assert from "node:assert/strict";
import { test } from "vitest";
import { GLYPHS } from "../../../packages/icons/generated/glyphs";
import { ANIMATED_GEOMETRY } from "../../../packages/icons/generated/animated";
import type { AnimatedPart, Clip } from "../../../packages/icons/geometry";
import { ICON_MOTIONS, type Track } from "../../../packages/icons/motion";
import type { AnimatedIconId } from "../../../packages/icons/parts";
import { containsPoint, flattenPath, type Point } from "../../../packages/icons/path";
import {
  isIdentityPose,
  resolvePose,
  transformPoint,
  type ResolvedPose,
} from "../../../packages/icons/sample";

const STEP = 0.25;
const SAMPLES: Point[] = [];
for (let y = 0.1031; y < 24; y += STEP) {
  for (let x = 0.1379; x < 24; x += STEP) SAMPLES.push([x, y]);
}

type Shape = (point: Point) => boolean;

function shape(d: string, rule: Clip["rule"] = "nonzero"): Shape {
  const polygons = flattenPath(d);
  return (point) => containsPoint(polygons, point, rule);
}

function partShape(part: AnimatedPart): Shape {
  const ink = shape(part.d);
  const clip = part.clip ? shape(part.clip.d, part.clip.rule) : undefined;
  return (point) => ink(point) && (clip?.(point) ?? true);
}

function windowShape(part: AnimatedPart): Shape {
  return part.window ? shape(part.window.d, part.window.rule) : () => true;
}

function inverse(pose: ResolvedPose, origin: readonly [number, number]): (point: Point) => Point {
  const radians = (pose.rotate * Math.PI) / 180;
  const skew = Math.tan((pose.skewX * Math.PI) / 180);
  return ([px, py]) => {
    const [ox, oy] = origin;
    let x = px - ox - pose.x;
    let y = py - oy - pose.y;
    const cos = Math.cos(-radians);
    const sin = Math.sin(-radians);
    [x, y] = [cos * x - sin * y, sin * x + cos * y];
    x /= pose.scaleX;
    y /= pose.scaleY;
    x -= skew * y;
    return [x + ox, y + oy];
  };
}

function tracksOf(icon: AnimatedIconId): readonly Track[] {
  return ICON_MOTIONS[icon].tracks;
}

const ICONS = Object.keys(ANIMATED_GEOMETRY) as AnimatedIconId[];

test(
  "the visible parts of every animated icon redraw its static glyph exactly at rest",
  { timeout: 30_000 },
  () => {
    for (const icon of ICONS) {
      const geometry = ANIMATED_GEOMETRY[icon];
      const glyph = GLYPHS[geometry.glyph as keyof typeof GLYPHS][24];
      assert.ok(glyph, `${icon}: static glyph ${geometry.glyph} has no 24-unit drawing`);
      const inGlyph = shape(glyph);
      const visible = geometry.parts
        .filter((part) => part.hidden === undefined)
        .map((part) => {
          const ink = partShape(part);
          const window = windowShape(part);
          return (point: Point) => ink(point) && window(point);
        });
      const wrong = SAMPLES.filter((point) => {
        const owners = visible.filter((covers) => covers(point)).length;
        return owners !== (inGlyph(point) ? 1 : 0);
      });
      assert.equal(
        wrong.length,
        0,
        `${icon}: ${wrong.length} sample points differ, first at ${wrong[0]}`,
      );
    }
  },
);

test("every animated part id matches exactly one part of its icon", () => {
  for (const icon of ICONS) {
    const ids = ANIMATED_GEOMETRY[icon].parts.map((part) => part.id);
    assert.equal(new Set(ids).size, ids.length, `${icon}: duplicate part ids`);
    for (const track of tracksOf(icon)) {
      assert.ok(ids.includes(track.part), `${icon}: motion targets missing part "${track.part}"`);
    }
    for (const part of ANIMATED_GEOMETRY[icon].parts) {
      if (part.within)
        assert.ok(ids.includes(part.within), `${icon}.${part.id}: within unknown part`);
      if (part.occluder)
        assert.ok(
          ids.includes(part.occluder.follows),
          `${icon}.${part.id}: occluder follows unknown part`,
        );
    }
  }
});

test("parts that are not in the glyph stay invisible at the start and end of the motion", () => {
  for (const icon of ICONS) {
    for (const part of ANIMATED_GEOMETRY[icon].parts) {
      if (part.hidden === undefined) continue;
      const track = tracksOf(icon).find((candidate) => candidate.part === part.id);
      const ends = track
        ? [track.keyframes[0]!, track.keyframes[track.keyframes.length - 1]!]
        : [{}];
      const ink = partShape(part);
      const points = SAMPLES.filter(ink);
      assert.ok(points.length > 0, `${icon}.${part.id}: part draws nothing`);
      for (const end of ends) {
        const pose = resolvePose(end);
        const origin = track?.origin ?? [12, 12];
        if (part.hidden === "opacity") {
          assert.equal(pose.opacity, 0, `${icon}.${part.id}: visible at an end of its motion`);
        } else if (part.hidden === "window") {
          const window = windowShape(part);
          const seen = points.filter((point) => window(transformPoint(pose, origin, point)));
          assert.equal(
            seen.length,
            0,
            `${icon}.${part.id}: shows through its window at an end of its motion`,
          );
        } else {
          const occluder = shape(part.occluder!.d);
          const seen = points.filter((point) => !occluder(transformPoint(pose, origin, point)));
          assert.equal(
            seen.length,
            0,
            `${icon}.${part.id}: not covered by its occluder at an end of its motion`,
          );
        }
      }
    }
  }
});

test("a motion that ends on a rotation ends on a symmetry of the part", () => {
  for (const icon of ICONS) {
    for (const track of tracksOf(icon)) {
      const last = resolvePose(track.keyframes[track.keyframes.length - 1]!);
      if (isIdentityPose(last) || last.rotate % 360 === 0) continue;
      const part = ANIMATED_GEOMETRY[icon].parts.find((candidate) => candidate.id === track.part)!;
      const inPart = partShape(part);
      const back = inverse(last, track.origin);
      const ink = SAMPLES.filter(inPart);
      const mismatched = SAMPLES.filter((point) => inPart(point) !== inPart(back(point)));
      assert.ok(
        mismatched.length / ink.length < 0.03,
        `${icon}.${part.id}: rotating by ${last.rotate}° moves ${mismatched.length} of ${ink.length} ink samples`,
      );
    }
  }
});
