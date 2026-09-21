import {
  ANIMATED_GEOMETRY,
  ICON_MOTIONS,
  cssEasing,
  cssTransform,
  resolvePose,
  type AnimatedIconId,
  type AnimatedPart,
  type Clip,
  type Track,
} from "@skriuw/icons";
import type { CSSProperties } from "react";

type AnimatedGlyphProps = {
  icon: AnimatedIconId;
  /** Unique per instance: clip, mask and window ids are built from it. */
  idPrefix: string;
};

type PartProps = AnimatedGlyphProps & { part: AnimatedPart };

type ClipDefProps = { id: string; clip: Clip };

const MASK_BOX = { x: -2, y: -2, width: 28, height: 28 } as const;

function trackFor(icon: AnimatedIconId, part: string): Track | undefined {
  return ICON_MOTIONS[icon].tracks.find((track) => track.part === part);
}

function originStyle(track: Track | undefined): CSSProperties | undefined {
  if (!track) return undefined;
  const [x, y] = track.origin;
  return { transformBox: "view-box", transformOrigin: `${x}px ${y}px` };
}

function ClipDef({ id, clip }: ClipDefProps) {
  return (
    <clipPath id={id} clipPathUnits="userSpaceOnUse">
      <path d={clip.d} clipRule={clip.rule} />
    </clipPath>
  );
}

function PartDefs({ icon, part, idPrefix }: PartProps) {
  const follows = part.occluder ? trackFor(icon, part.occluder.follows) : undefined;
  return (
    <>
      {part.clip && <ClipDef id={`${idPrefix}-${part.id}-clip`} clip={part.clip} />}
      {part.window && <ClipDef id={`${idPrefix}-${part.id}-window`} clip={part.window} />}
      {part.occluder && (
        <mask id={`${idPrefix}-${part.id}-mask`} maskUnits="userSpaceOnUse" {...MASK_BOX}>
          <rect {...MASK_BOX} fill="white" />
          <g data-motion-part={part.occluder.follows} style={originStyle(follows)}>
            <path d={part.occluder.d} fill="black" />
          </g>
        </mask>
      )}
    </>
  );
}

function PartNode({ icon, part, idPrefix }: PartProps) {
  const nested = ANIMATED_GEOMETRY[icon].parts.filter((candidate) => candidate.within === part.id);
  let node = (
    <g data-motion-part={part.id} style={originStyle(trackFor(icon, part.id))}>
      <path d={part.d} clipPath={part.clip ? `url(#${idPrefix}-${part.id}-clip)` : undefined} />
      {nested.map((child) => (
        <PartNode key={child.id} icon={icon} part={child} idPrefix={idPrefix} />
      ))}
    </g>
  );
  if (part.window) node = <g clipPath={`url(#${idPrefix}-${part.id}-window)`}>{node}</g>;
  if (part.occluder) node = <g mask={`url(#${idPrefix}-${part.id}-mask)`}>{node}</g>;
  return node;
}

/**
 * The moving parts of an animated icon, drawn on the 24-unit grid. They stay
 * hidden until `playIconMotion` swaps them in for the static glyph, so the
 * icon at rest is always the exact Fluent drawing.
 */
export function AnimatedGlyph({ icon, idPrefix }: AnimatedGlyphProps) {
  const parts = ANIMATED_GEOMETRY[icon].parts;
  return (
    <g data-motion-parts="" visibility="hidden">
      <defs>
        {parts.map((part) => (
          <PartDefs key={part.id} icon={icon} part={part} idPrefix={idPrefix} />
        ))}
      </defs>
      {parts
        .filter((part) => part.within === undefined)
        .map((part) => (
          <PartNode key={part.id} icon={icon} part={part} idPrefix={idPrefix} />
        ))}
    </g>
  );
}

function webKeyframes(track: Track): Keyframe[] {
  return track.keyframes.map((keyframe) => {
    const pose = resolvePose(keyframe);
    return {
      offset: keyframe.at,
      transform: cssTransform(pose),
      opacity: pose.opacity,
      easing: cssEasing(keyframe.ease ?? track.ease),
    };
  });
}

/**
 * Plays an icon's motion once with the Web Animations API, on the compositor
 * where the browser can. The static glyph is hidden for exactly as long as the
 * parts are moving. Returns false when a run is already in progress.
 */
export function playIconMotion(svg: SVGSVGElement, icon: AnimatedIconId): boolean {
  if (svg.dataset.motionPlaying === "true") return false;
  const rest = svg.querySelector<SVGElement>("[data-motion-rest]");
  const parts = svg.querySelector<SVGElement>("[data-motion-parts]");
  if (!rest || !parts || typeof parts.animate !== "function") return false;
  const animations = ICON_MOTIONS[icon].tracks.flatMap((track) => {
    const keyframes = webKeyframes(track);
    return [...svg.querySelectorAll<SVGElement>(`[data-motion-part="${track.part}"]`)].map((element) =>
      element.animate(keyframes, { duration: track.duration, delay: track.delay ?? 0, fill: "both" }),
    );
  });
  svg.dataset.motionPlaying = "true";
  rest.setAttribute("visibility", "hidden");
  parts.setAttribute("visibility", "visible");
  function settle() {
    rest?.setAttribute("visibility", "visible");
    parts?.setAttribute("visibility", "hidden");
    for (const animation of animations) animation.cancel();
    delete svg.dataset.motionPlaying;
  }
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(settle);
  return true;
}
