import { Suspense, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { iconStrokeWidth } from "../icons";
import { useAnimatedIcons } from "./animated-icons-context";
import { APP_ICONS } from "./registry";
import type { AppIconName } from "./registry";

type Props = {
  name: AppIconName;
  size?: number;
  className?: string;
};

/**
 * Buttons are the hover target, not the glyph: a 16px icon inside a 36px
 * button would otherwise only animate when the pointer crossed the strokes.
 */
const HOVER_HOST_SELECTOR = "button, a[href], label, [role='button']";

function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback !== "function") {
    const timer = setTimeout(run, 200);
    return () => clearTimeout(timer);
  }
  const handle = requestIdleCallback(run, { timeout: 2000 });
  return () => cancelIdleCallback(handle);
}

/**
 * The one icon component the application renders. It resolves the static and
 * animated counterparts from the registry and decides between them from the
 * global preference, so call sites only name the action.
 *
 * When animation is on, the animated component is fetched and mounted during
 * idle time rather than on hover — waiting for a chunk at hover time is
 * perceptible. When it is off, nothing is fetched or mounted at all and the
 * cost is exactly the static SVG that would have rendered anyway.
 */
export function AppIcon({ name, size = 16, className }: Props) {
  const entry = APP_ICONS[name];
  const StaticIcon = entry.static;
  const AnimatedIcon = "animated" in entry ? entry.animated : undefined;
  const animationEnabled = useAnimatedIcons() && AnimatedIcon !== undefined;

  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (!animationEnabled || !AnimatedIcon) {
      return;
    }
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void AnimatedIcon.preload().then(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [animationEnabled, AnimatedIcon]);

  useEffect(() => {
    if (!animationEnabled) {
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const host = anchor.closest(HOVER_HOST_SELECTOR) ?? anchor;
    function enter() {
      setReady(true);
      setHovering(true);
    }
    function leave() {
      setHovering(false);
    }
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
    };
  }, [animationEnabled]);

  useEffect(() => {
    if (animationEnabled) {
      return;
    }
    setReady(false);
    setHovering(false);
  }, [animationEnabled]);

  const fallback = <StaticIcon size={size} aria-hidden="true" />;
  const showAnimated = animationEnabled && ready && AnimatedIcon !== undefined;

  return (
    <span
      ref={anchorRef}
      className={`app-icon${className ? ` ${className}` : ""}`}
      style={{ "--app-icon-stroke": iconStrokeWidth(size) } as CSSProperties}
      aria-hidden="true"
    >
      {showAnimated ? (
        <Suspense fallback={fallback}>
          <AnimatedIcon size={size} animate={hovering} />
        </Suspense>
      ) : (
        fallback
      )}
    </span>
  );
}
