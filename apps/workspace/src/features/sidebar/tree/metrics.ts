import { useEffect, useState } from "react";
import type { RefObject } from "react";

export type TreeMetrics = {
  isNarrow: boolean;
  isVeryNarrow: boolean;
  basePadding: number;
  depthIndent: number;
  rightPadding: number;
};

const NARROW_WIDTH_PX = 220;
const VERY_NARROW_WIDTH_PX = 176;

export function treeMetrics(sidebarWidth: number | null): TreeMetrics {
  const isNarrow = sidebarWidth !== null && sidebarWidth < NARROW_WIDTH_PX;
  const isVeryNarrow = sidebarWidth !== null && sidebarWidth < VERY_NARROW_WIDTH_PX;
  return {
    isNarrow,
    isVeryNarrow,
    basePadding: isNarrow ? 8 : 12,
    depthIndent: isVeryNarrow ? 8 : isNarrow ? 12 : 16,
    rightPadding: isNarrow ? 6 : 10,
  };
}

export function maximumTreeIndent(metrics: TreeMetrics): number {
  return metrics.isVeryNarrow ? 40 : metrics.isNarrow ? 56 : 80;
}

export function useTreeMetrics(asideRef: RefObject<HTMLElement | null>): TreeMetrics {
  const [metrics, setMetrics] = useState(() => treeMetrics(null));

  useEffect(() => {
    const element = asideRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width === undefined) {
        return;
      }
      setMetrics((previous) => {
        const next = treeMetrics(width);
        return next.isNarrow === previous.isNarrow && next.isVeryNarrow === previous.isVeryNarrow
          ? previous
          : next;
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return metrics;
}
