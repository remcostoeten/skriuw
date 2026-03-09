"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type LayoutShiftLike = PerformanceEntry & {
  hadRecentInput?: boolean;
  value?: number;
};

type MetricEntry =
  | PerformanceEntry
  | PerformanceEventTiming
  | LargestContentfulPaint
  | LayoutShiftLike;

function logMetric(label: string, payload: Record<string, number | string>) {
  console.info(`[perf] ${label}`, payload);
}

export function PerformanceMonitor() {
  const pathname = usePathname();
  const routeStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    routeStartRef.current = performance.now();

    requestAnimationFrame(() => {
      const routeDuration = performance.now() - (routeStartRef.current ?? 0);
      logMetric("route-ready", {
        pathname,
        duration: Number(routeDuration.toFixed(1)),
      });
    });
  }, [pathname]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || typeof PerformanceObserver === "undefined") {
      return;
    }

    const observers: PerformanceObserver[] = [];

    const observe = (
      type: string,
      handler: (entry: MetricEntry) => void,
      options?: PerformanceObserverInit,
    ) => {
      try {
        const observer = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => handler(entry as MetricEntry));
        });
        observer.observe(options ?? { type, buffered: true });
        observers.push(observer);
      } catch {
        // Ignore unsupported entry types per browser.
      }
    };

    observe("paint", (entry) => {
      logMetric(entry.name, { duration: Number(entry.startTime.toFixed(1)) });
    });

    observe("largest-contentful-paint", (entry) => {
      const lcpEntry = entry as LargestContentfulPaint;
      logMetric("lcp", {
        pathname,
        startTime: Number(lcpEntry.startTime.toFixed(1)),
      });
    });

    observe("layout-shift", (entry) => {
      const layoutShiftEntry = entry as LayoutShiftLike;
      if (layoutShiftEntry.hadRecentInput) return;

      logMetric("cls", {
        pathname,
        value: Number((layoutShiftEntry.value ?? 0).toFixed(4)),
      });
    });

    observe("longtask", (entry) => {
      logMetric("longtask", {
        pathname,
        duration: Number(entry.duration.toFixed(1)),
      });
    });

    observe(
      "event",
      (entry) => {
        const eventEntry = entry as PerformanceEventTiming;
        if (eventEntry.duration < 120) return;

        logMetric("interaction", {
          pathname,
          name: eventEntry.name,
          duration: Number(eventEntry.duration.toFixed(1)),
        });
      },
      { type: "event", buffered: true, durationThreshold: 120 } as PerformanceObserverInit,
    );

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [pathname]);

  return null;
}
