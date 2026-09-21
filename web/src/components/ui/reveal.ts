"use client";

import { useEffect, useRef, type CSSProperties } from "react";

function inViewport(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  return rect.top < window.innerHeight - 80 && rect.bottom > 0;
}

/**
 * Marks the element with `data-visible` the first time it scrolls into view.
 * Pair with the `.reveal`, `.reveal-wipe` or `.reveal-group` classes.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;

    if (!node) {
      return;
    }

    if (typeof IntersectionObserver === "undefined" || inViewport(node)) {
      node.setAttribute("data-visible", "");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.setAttribute("data-visible", "");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -80px 0px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return ref;
}

/**
 * Positions a direct child of `.reveal-group` in the stagger ladder.
 * Spread onto the child's `style`; the delay is `index * --reveal-step`.
 */
export function stagger(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}
