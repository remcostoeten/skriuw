import { ICON_REGISTRY, selectGlyph } from "@skriuw/icons";
import { useEffect, useId, useRef } from "react";
import { AnimatedGlyph, playIconMotion } from "./animated-glyph";
import { useAnimatedIcons } from "./animated-icons-context";
import type { AppIconName } from "./registry";

type Props = {
  /** Action name from the icon registry, e.g. `"search"`. */
  name: AppIconName;
  /** Width and height in pixels. */
  size?: number;
  /** Extra class on the icon. */
  className?: string;
};

/**
 * Buttons are the hover target, not the glyph: a 16px icon inside a 36px
 * button would otherwise only animate when the pointer crossed its ink.
 */
const HOVER_HOST_SELECTOR = "button, a[href], label, [role='button']";
const ANIMATED_GRID = 24;

/**
 * The one icon component the application renders for named actions. It draws
 * the action's Fluent glyph and, when the animated-icons preference is on,
 * plays the action's motion once each time the pointer enters the host
 * control. The motion data ships in the main bundle, so nothing is fetched on
 * hover and hovering never re-renders React.
 */
export function AppIcon({ name, size = 16, className }: Props) {
  const entry = ICON_REGISTRY[name];
  const motion = "motion" in entry ? entry.motion : undefined;
  const animated = useAnimatedIcons() && motion !== undefined;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const idPrefix = `icon${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const glyph = selectGlyph(entry.glyph, size, ANIMATED_GRID);

  useEffect(() => {
    const svg = svgRef.current;
    if (!animated || !motion || !svg) return;
    const host = svg.closest(HOVER_HOST_SELECTOR) ?? svg.parentElement ?? svg;
    function play() {
      if (svg) playIconMotion(svg, motion!);
    }
    host.addEventListener("pointerenter", play);
    return () => host.removeEventListener("pointerenter", play);
  }, [animated, motion]);

  return (
    <span className={`app-icon${className ? ` ${className}` : ""}`} aria-hidden="true">
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${glyph.grid} ${glyph.grid}`}
        width={size}
        height={size}
        fill="currentColor"
        focusable="false"
        overflow="visible"
      >
        <path data-motion-rest="" d={glyph.d} />
        {animated && motion && <AnimatedGlyph icon={motion} idPrefix={idPrefix} />}
      </svg>
    </span>
  );
}
