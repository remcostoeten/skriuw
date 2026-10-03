import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * Tracks whether an element sits within `margin` of the viewport, flipping
 * back when it scrolls away so heavy children (decoded images, video
 * elements) exist only for the tiles near the screen. Without
 * IntersectionObserver every element counts as near.
 */
export function useNearViewport<T extends Element>(
  margin = "600px",
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const target = ref.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (observed) => {
        const last = observed[observed.length - 1];
        if (last) setNear(last.isIntersecting);
      },
      { rootMargin: margin },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [margin]);
  return [ref, near];
}
