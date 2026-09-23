import assert from "node:assert/strict";
import { test } from "vitest";
import { ANIMATED_GEOMETRY, GLYPHS, ICON_MOTIONS, ICON_REGISTRY } from "@skriuw/icons";
import { SHELL_DESTINATIONS, type ShellIconName } from "@/shell/destinations";
import {
  SHELL_ICON_GRID,
  shellGlyph,
  shellMotionFrame,
  shellMotionLength,
  type PartFrame,
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
  "back",
  "forward",
];

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

test("a motion frame covers every animated part and settles back at rest", () => {
  for (const name of SHELL_ICONS) {
    const { motion } = shellGlyph(name);
    if (!motion) continue;
    const length = shellMotionLength(motion);
    const middle = shellMotionFrame(motion, length / 2);
    const tracked = new Set(ICON_MOTIONS[motion].tracks.map((track) => track.part));
    assert.deepEqual(new Set(middle.keys()), tracked);
    for (const part of ANIMATED_GEOMETRY[motion].parts) {
      if (!tracked.has(part.id)) continue;
      const end: PartFrame = shellMotionFrame(motion, length).get(part.id)!;
      if (part.hidden === "opacity") assert.equal(end.opacity, 0, `${motion}.${part.id}`);
      else if (part.hidden === undefined) assert.equal(end.opacity, 1, `${motion}.${part.id}`);
    }
  }
});

test("frames are SVG transforms react-native-svg can parse", () => {
  const frame = shellMotionFrame("plus", 250).get("arms")!;
  assert.match(
    frame.transform,
    /^translate\([-\d. ]+\) rotate\([-\d.]+\) scale\([-\d. ]+\) skewX\([-\d.]+\) translate\([-\d. ]+\)$/,
  );
});
