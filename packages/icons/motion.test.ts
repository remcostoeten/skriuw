import assert from "node:assert/strict";
import test from "node:test";
import { EASINGS, evaluateEasing } from "./easing";
import { ANIMATED_GEOMETRY } from "./generated/animated";
import { ICON_MOTIONS, motionDuration } from "./motion";
import type { AnimatedIconId } from "./parts";
import { isIdentityPose, resolvePose, samplePose } from "./sample";

const ICONS = Object.keys(ICON_MOTIONS) as AnimatedIconId[];

function hiddenParts(icon: AnimatedIconId): Set<string> {
  return new Set(
    ANIMATED_GEOMETRY[icon].parts.filter((part) => part.hidden).map((part) => part.id),
  );
}

test("every animated icon has a motion and every motion has geometry", () => {
  assert.deepEqual([...ICONS].sort(), Object.keys(ANIMATED_GEOMETRY).sort());
});

test("keyframes are ordered, start at 0 and end at 1", () => {
  for (const icon of ICONS) {
    for (const track of ICON_MOTIONS[icon].tracks) {
      const offsets = track.keyframes.map((keyframe) => keyframe.at);
      assert.equal(offsets[0], 0, `${icon}.${track.part}: first keyframe is not at 0`);
      assert.equal(
        offsets[offsets.length - 1],
        1,
        `${icon}.${track.part}: last keyframe is not at 1`,
      );
      for (let index = 1; index < offsets.length; index += 1) {
        assert.ok(
          offsets[index]! >= offsets[index - 1]!,
          `${icon}.${track.part}: keyframes out of order`,
        );
      }
      assert.ok(track.duration > 0 && (track.delay ?? 0) >= 0);
    }
  }
});

test("every visible part starts at rest and ends at rest or on a declared symmetry", () => {
  for (const icon of ICONS) {
    const motion = ICON_MOTIONS[icon];
    const symmetry = motion.endsOnSymmetry;
    const hidden = hiddenParts(icon);
    for (const track of motion.tracks) {
      if (hidden.has(track.part)) continue;
      const first = track.keyframes[0]!;
      const last = resolvePose(track.keyframes[track.keyframes.length - 1]!);
      assert.ok(isIdentityPose(first), `${icon}.${track.part}: does not start at rest`);
      if (isIdentityPose(last)) continue;
      const { rotate, ...rest } = last;
      assert.ok(
        isIdentityPose({ ...rest, rotate: 0 }),
        `${icon}.${track.part}: ends away from rest`,
      );
      assert.ok(
        rotate % 360 === 0 || rotate === symmetry,
        `${icon}.${track.part}: ends on ${rotate}°, not a declared symmetry`,
      );
    }
  }
});

test("no visible part fades: opacity stays at 1 throughout", () => {
  for (const icon of ICONS) {
    const hidden = hiddenParts(icon);
    for (const track of ICON_MOTIONS[icon].tracks) {
      if (hidden.has(track.part)) continue;
      for (const keyframe of track.keyframes) {
        assert.equal(
          resolvePose(keyframe).opacity,
          1,
          `${icon}.${track.part}: animates opacity at ${keyframe.at}`,
        );
      }
    }
  }
});

test("echo parts start and end fully transparent", () => {
  for (const icon of ICONS) {
    for (const part of ANIMATED_GEOMETRY[icon].parts) {
      if (part.hidden !== "opacity") continue;
      const track = ICON_MOTIONS[icon].tracks.find((candidate) => candidate.part === part.id)!;
      assert.equal(resolvePose(track.keyframes[0]!).opacity, 0);
      assert.equal(resolvePose(track.keyframes[track.keyframes.length - 1]!).opacity, 0);
    }
  }
});

test("no motion skews the notes folder or the trash lid", () => {
  for (const icon of ["notes", "trash"] as const) {
    for (const track of ICON_MOTIONS[icon].tracks) {
      for (const keyframe of track.keyframes) assert.equal(resolvePose(keyframe).skewX, 0);
    }
  }
});

test("sampling a track honours its delay, keyframes and per-segment easing", () => {
  const track = ICON_MOTIONS.plus.tracks[0]!;
  assert.deepEqual(samplePose(track, -10), resolvePose({}));
  assert.equal(samplePose(track, track.duration * 0.4).rotate, 60);
  assert.equal(samplePose(track, track.duration + 100).rotate, 90);
  const shoulders = ICON_MOTIONS.account.tracks.find(
    (candidate) => candidate.part === "shoulders",
  )!;
  assert.equal(samplePose(shoulders, 60).y, 0);
  assert.ok(samplePose(shoulders, 200).y < 0);
  assert.equal(motionDuration(ICON_MOTIONS.tasks), 820 + 220);
});

test("easing tokens evaluate as the CSS cubic-bezier they name", () => {
  for (const token of Object.keys(EASINGS) as (keyof typeof EASINGS)[]) {
    assert.equal(evaluateEasing(token, 0), 0);
    assert.equal(evaluateEasing(token, 1), 1);
  }
  assert.ok(Math.abs(evaluateEasing("standard", 0.5) - 0.5) < 1e-6);
  assert.ok(evaluateEasing("spring", 0.6) > 1, "the spring token overshoots");
  assert.ok(evaluateEasing("out", 0.25) > 0.6);
});
