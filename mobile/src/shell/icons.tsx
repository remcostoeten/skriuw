import { ANIMATED_GEOMETRY, type AnimatedIconId, type AnimatedPart, type Clip } from "@skriuw/icons";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import Svg, { ClipPath, Defs, G, Mask, Path, Rect } from "react-native-svg";
import type { ShellIconName } from "./destinations";
import { SHELL_ICON_GRID, shellGlyph, shellMotionFrame, shellMotionLength, type PartFrame } from "./icon-model";

type ShellIconProps = {
  name: ShellIconName;
  color: string;
  size?: number;
  /** Plays the icon's motion once each time this value changes. */
  playKey?: number;
};

type MotionPartsProps = {
  motion: AnimatedIconId;
  frame: ReadonlyMap<string, PartFrame>;
  prefix: string;
};

const MASK_BOX = { x: -2, y: -2, width: 28, height: 28 } as const;

function useMotionClock(motion: AnimatedIconId | undefined, playKey: number | undefined): number | null {
  const [elapsed, setElapsed] = useState<number | null>(null);
  const firstKey = useRef(playKey);
  useEffect(() => {
    if (motion === undefined || playKey === undefined || playKey === firstKey.current) return;
    const length = shellMotionLength(motion);
    let start: number | undefined;
    let handle = 0;
    function tick(now: number) {
      start ??= now;
      const time = now - start;
      if (time >= length) {
        setElapsed(null);
        return;
      }
      setElapsed(time);
      handle = requestAnimationFrame(tick);
    }
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      setElapsed(null);
    };
  }, [motion, playKey]);
  return elapsed;
}

function clipDef(id: string, clip: Clip) {
  return (
    <ClipPath key={id} id={id}>
      <Path d={clip.d} clipRule={clip.rule} />
    </ClipPath>
  );
}

function partNode(
  part: AnimatedPart,
  parts: readonly AnimatedPart[],
  frame: ReadonlyMap<string, PartFrame>,
  prefix: string,
): ReactNode {
  const pose = frame.get(part.id);
  let node: ReactNode = (
    <G key={part.id} transform={pose?.transform} opacity={pose?.opacity}>
      <Path d={part.d} clipPath={part.clip ? `url(#${prefix}-${part.id}-clip)` : undefined} />
      {parts
        .filter((child) => child.within === part.id)
        .map((child) => partNode(child, parts, frame, prefix))}
    </G>
  );
  if (part.window) {
    node = (
      <G key={`${part.id}-window`} clipPath={`url(#${prefix}-${part.id}-window)`}>
        {node}
      </G>
    );
  }
  if (part.occluder) {
    node = (
      <G key={`${part.id}-mask`} mask={`url(#${prefix}-${part.id}-mask)`}>
        {node}
      </G>
    );
  }
  return node;
}

function MotionParts({ motion, frame, prefix }: MotionPartsProps) {
  const parts = ANIMATED_GEOMETRY[motion].parts;
  return (
    <>
      <Defs>
        {parts.flatMap((part) => [
          part.clip ? clipDef(`${prefix}-${part.id}-clip`, part.clip) : null,
          part.window ? clipDef(`${prefix}-${part.id}-window`, part.window) : null,
          part.occluder ? (
            <Mask key={`${part.id}-mask`} id={`${prefix}-${part.id}-mask`} maskUnits="userSpaceOnUse" {...MASK_BOX}>
              <Rect {...MASK_BOX} fill="white" />
              <G transform={frame.get(part.occluder.follows)?.transform}>
                <Path d={part.occluder.d} fill="black" />
              </G>
            </Mask>
          ) : null,
        ])}
      </Defs>
      {parts.filter((part) => part.within === undefined).map((part) => partNode(part, parts, frame, prefix))}
    </>
  );
}

/**
 * The shell's icons: the shared Fluent glyphs drawn with react-native-svg.
 * At rest an icon is its static glyph; `playKey` swaps in the moving parts
 * for one run of the shared motion spec, sampled on the JS thread per frame.
 */
export function ShellIcon({ name, color, size = 20, playKey }: ShellIconProps) {
  const glyph = shellGlyph(name);
  const elapsed = useMotionClock(glyph.motion, playKey);
  const prefix = `icon${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const playing = glyph.motion !== undefined && elapsed !== null;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${SHELL_ICON_GRID} ${SHELL_ICON_GRID}`} fill={color}>
        {playing ? (
          <MotionParts motion={glyph.motion!} frame={shellMotionFrame(glyph.motion!, elapsed)} prefix={prefix} />
        ) : (
          <Path d={glyph.d} />
        )}
      </Svg>
    </View>
  );
}
