import {
  ANIMATED_GEOMETRY,
  type AnimatedIconId,
  type AnimatedPart,
  type Clip,
} from "@skriuw/icons";
import { useEffect, useId, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { ClipPath, Defs, G, Mask, Path, Rect } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import type { ShellIconName } from "./destinations";
import {
  SHELL_ICON_GRID,
  shellGlyph,
  shellMotionSamples,
  shellPartPose,
  type Affine,
  type MotionSamples,
} from "./icon-model";

type ShellIconProps = {
  name: ShellIconName;
  color: string;
  size?: number;
  /** Plays the icon's motion once each time this value changes. */
  playKey?: number;
};

type MotionPartsProps = {
  motion: AnimatedIconId;
  prefix: string;
  playKey: number;
  onSettled: (playKey: number) => void;
};

type MovingGroupProps = {
  times: Float64Array;
  values: Float64Array;
  clock: SharedValue<number>;
  fades: boolean;
  children: ReactNode;
};

type Playback = {
  samples: MotionSamples;
  clock: SharedValue<number>;
  prefix: string;
};

const MASK_BOX = { x: -2, y: -2, width: 28, height: 28 } as const;

const AnimatedG = Animated.createAnimatedComponent(G<{ matrix?: Affine }>);

function MovingGroup({ times, values, clock, fades, children }: MovingGroupProps) {
  const animatedProps = useAnimatedProps(() => {
    const pose = shellPartPose(times, values, clock.get());
    return { matrix: pose.matrix, opacity: fades ? pose.opacity : 1 };
  });
  return (
    <AnimatedG animatedProps={animatedProps} transform={shellPartPose(times, values, 0).matrix}>
      {children}
    </AnimatedG>
  );
}

function partGroup(
  key: string,
  values: Float64Array | undefined,
  fades: boolean,
  playback: Playback,
  children: ReactNode,
): ReactNode {
  if (values === undefined) return <G key={key}>{children}</G>;
  return (
    <MovingGroup
      key={key}
      times={playback.samples.times}
      values={values}
      clock={playback.clock}
      fades={fades}
    >
      {children}
    </MovingGroup>
  );
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
  playback: Playback,
): ReactNode {
  const { prefix } = playback;
  let node = partGroup(part.id, playback.samples.parts.get(part.id), true, playback, [
    <Path
      key="path"
      d={part.d}
      clipPath={part.clip ? `url(#${prefix}-${part.id}-clip)` : undefined}
    />,
    ...parts
      .filter((child) => child.within === part.id)
      .map((child) => partNode(child, parts, playback)),
  ]);
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

function MotionParts({ motion, prefix, playKey, onSettled }: MotionPartsProps) {
  const samples = shellMotionSamples(motion);
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.set(0);
    clock.set(
      withTiming(
        samples.length,
        { duration: samples.length, easing: Easing.linear },
        (finished) => {
          if (finished) scheduleOnRN(onSettled, playKey);
        },
      ),
    );
    return () => cancelAnimation(clock);
  }, [clock, samples, playKey, onSettled]);
  const playback: Playback = { samples, clock, prefix };
  const parts = ANIMATED_GEOMETRY[motion].parts;
  return (
    <>
      <Defs>
        {parts.flatMap((part) => [
          part.clip ? clipDef(`${prefix}-${part.id}-clip`, part.clip) : null,
          part.window ? clipDef(`${prefix}-${part.id}-window`, part.window) : null,
          part.occluder ? (
            <Mask
              key={`${part.id}-mask`}
              id={`${prefix}-${part.id}-mask`}
              maskUnits="userSpaceOnUse"
              {...MASK_BOX}
            >
              <Rect {...MASK_BOX} fill="white" />
              {partGroup(
                "occluder",
                samples.parts.get(part.occluder.follows),
                false,
                playback,
                <Path d={part.occluder.d} fill="black" />,
              )}
            </Mask>
          ) : null,
        ])}
      </Defs>
      {parts
        .filter((part) => part.within === undefined)
        .map((part) => partNode(part, parts, playback))}
    </>
  );
}

/**
 * The shell's icons: the shared Fluent glyphs drawn with react-native-svg.
 * At rest an icon is its static glyph; `playKey` mounts the moving parts for
 * one run of the shared motion spec, played on the UI thread from samples
 * computed once per motion, and unmounts them when the run ends.
 */
export function ShellIcon({ name, color, size = 20, playKey }: ShellIconProps) {
  const glyph = shellGlyph(name);
  const [settledKey, setSettledKey] = useState(playKey);
  const prefix = `icon${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const motion = playKey === settledKey ? undefined : glyph.motion;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${SHELL_ICON_GRID} ${SHELL_ICON_GRID}`}
        fill={color}
      >
        {motion === undefined || playKey === undefined ? (
          <Path d={glyph.d} />
        ) : (
          <MotionParts
            key={motion}
            motion={motion}
            prefix={prefix}
            playKey={playKey}
            onSettled={setSettledKey}
          />
        )}
      </Svg>
    </View>
  );
}
