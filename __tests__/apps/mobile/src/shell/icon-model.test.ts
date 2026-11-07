import assert from "node:assert/strict";
import { test } from "vitest";
import {
  ANIMATED_GEOMETRY,
  GLYPHS,
  ICON_MOTIONS,
  ICON_REGISTRY,
  samplePose,
  svgTransform,
  type AnimatedIconId,
} from "@skriuw/icons";
import { SHELL_DESTINATIONS, type ShellIconName } from "@/shell/destinations";
import {
  SHELL_ICON_GRID,
  shellGlyph,
  shellMotionLength,
  shellMotionSamples,
  shellPartPose,
  type Affine,
} from "@/shell/icon-model";

const SHELL_ICONS: readonly ShellIconName[] = [
  "notes",
  "journal",
  "tasks",
  "tags",
  "people",
  "trash",
  "account",
  "search",
  "menu",
  "close",
  "plus",
  "folder",
  "chevron",
  "pin",
  "lock",
  "back",
  "forward",
];

const MOTIONS = Object.keys(ICON_MOTIONS).filter(
  (motion): motion is AnimatedIconId => motion in ANIMATED_GEOMETRY,
);

function multiply([a1, b1, c1, d1, e1, f1]: Affine, [a2, b2, c2, d2, e2, f2]: Affine): Affine {
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function operation(name: string, [first = 0, second = 0]: readonly number[]): Affine {
  const radians = (first * Math.PI) / 180;
  if (name === "translate") return [1, 0, 0, 1, first, second];
  if (name === "rotate") {
    return [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0];
  }
  if (name === "scale") return [first, 0, 0, second, 0, 0];
  if (name === "skewX") return [1, 0, Math.tan(radians), 1, 0, 0];
  throw new Error(`unexpected transform ${name}`);
}

function stringMatrix(transform: string): Affine {
  let matrix: Affine = [1, 0, 0, 1, 0, 0];
  // Each `name(arguments)` in the SVG transform list.
  for (const [, name = "", args = ""] of transform.matchAll(/(\w+)\(([^)]*)\)/g)) {
    matrix = multiply(matrix, operation(name, args.split(" ").map(Number)));
  }
  return matrix;
}

function assertMatrix(actual: Affine, expected: Affine, label: string) {
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]!) < 2e-3, `${label}: ${actual} != ${expected}`);
  });
}

test("every shell icon resolves to the same 24-unit glyph the desktop draws", () => {
  assert.equal(SHELL_ICON_GRID, 24);
  for (const name of SHELL_ICONS) {
    assert.equal(shellGlyph(name).d, GLYPHS[ICON_REGISTRY[name].glyph][24], name);
  }
});

test("every tab-bar destination animates on press", () => {
  for (const destination of SHELL_DESTINATIONS) {
    assert.ok(shellGlyph(destination.icon).motion, `${destination.icon} has no motion`);
  }
  assert.ok(shellGlyph("account").motion);
});

test("samples cover every animated part for the whole motion and settle back at rest", () => {
  for (const name of SHELL_ICONS) {
    const { motion } = shellGlyph(name);
    if (!motion) continue;
    const { length, times, parts } = shellMotionSamples(motion);
    assert.equal(length, shellMotionLength(motion));
    assert.equal(times[0], 0);
    assert.equal(times[times.length - 1], length);
    assert.ok(
      times.every((time, index) => index === 0 || time > times[index - 1]!),
      motion,
    );
    const tracked = new Set(ICON_MOTIONS[motion].tracks.map((track) => track.part));
    assert.deepEqual(new Set(parts.keys()), tracked);
    for (const part of ANIMATED_GEOMETRY[motion].parts) {
      const values = parts.get(part.id);
      if (!values) continue;
      const end = shellPartPose(times, values, length);
      if (part.hidden === "opacity") assert.equal(end.opacity, 0, `${motion}.${part.id}`);
      else if (part.hidden === undefined) assert.equal(end.opacity, 1, `${motion}.${part.id}`);
    }
  }
});

test("every sample is the matrix react-native-svg draws from the shared SVG transform", () => {
  for (const motion of MOTIONS) {
    const { times, parts } = shellMotionSamples(motion);
    for (const track of ICON_MOTIONS[motion].tracks) {
      const values = parts.get(track.part)!;
      for (const time of times) {
        const pose = samplePose(track, time);
        const sampled = shellPartPose(times, values, time);
        const label = `${motion}.${track.part} at ${time}`;
        assertMatrix(sampled.matrix, stringMatrix(svgTransform(pose, track.origin)), label);
        assert.ok(Math.abs(sampled.opacity - pose.opacity) < 1e-9, label);
      }
    }
  }
});

test("every keyframe lands on a sample, so a jump stays inside its own keyframes", () => {
  for (const motion of MOTIONS) {
    const { times, parts } = shellMotionSamples(motion);
    for (const track of ICON_MOTIONS[motion].tracks) {
      for (const keyframe of track.keyframes) {
        const time = (track.delay ?? 0) + keyframe.at * track.duration;
        const expected = stringMatrix(svgTransform(samplePose(track, time), track.origin));
        const actual = shellPartPose(times, parts.get(track.part)!, time).matrix;
        assertMatrix(actual, expected, `${motion}.${track.part} at ${keyframe.at}`);
      }
    }
  }
  const { times, parts } = shellMotionSamples("journal");
  const days = parts.get("days")!;
  assert.ok(Math.abs(shellPartPose(times, days, 0.42 * 760).matrix[4] + 14) < 1e-9);
  assert.ok(Math.abs(shellPartPose(times, days, 0.43 * 760).matrix[4] - 14) < 1e-9);
});

test("a pose interpolates between samples and holds outside the motion", () => {
  const { length, times, parts } = shellMotionSamples("plus");
  const arms = parts.get("arms")!;
  const before = shellPartPose(times, arms, times[3]!);
  const after = shellPartPose(times, arms, times[4]!);
  const middle = shellPartPose(times, arms, (times[3]! + times[4]!) / 2);
  middle.matrix.forEach((value, index) => {
    assert.ok(Math.abs(value - (before.matrix[index]! + after.matrix[index]!) / 2) < 1e-9);
  });
  assert.deepEqual(shellPartPose(times, arms, -50), shellPartPose(times, arms, 0));
  assert.deepEqual(shellPartPose(times, arms, length + 50), shellPartPose(times, arms, length));
});

test("a motion is sampled once and shared by every icon that plays it", () => {
  assert.equal(shellMotionSamples("plus"), shellMotionSamples("plus"));
});
