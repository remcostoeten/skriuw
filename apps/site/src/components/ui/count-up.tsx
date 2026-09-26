"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: string;
  duration?: number;
};

const numberPattern = /\d[\d,]*/;

function easeOut(progress: number) {
  return 1 - Math.pow(1 - progress, 4);
}

/**
 * Counts the first number inside `value` up from zero the first time it
 * scrolls into view, keeping any prefix, suffix and thousands separators.
 */
export function CountUp({ value, duration = 1200 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    const match = value.match(numberPattern);

    if (!node || !match || typeof IntersectionObserver === "undefined") {
      return;
    }

    const element: HTMLSpanElement = node;
    const target = Number(match[0].replaceAll(",", ""));
    const grouped = match[0].includes(",");
    let frame = 0;

    function render(current: number) {
      const text = grouped ? current.toLocaleString("en-US") : String(current);
      element.textContent = value.replace(numberPattern, text);
    }

    function run() {
      const start = performance.now();

      function tick(now: number) {
        const progress = Math.min(1, (now - start) / duration);
        render(Math.round(target * easeOut(progress)));

        if (progress < 1) {
          frame = requestAnimationFrame(tick);
        }
      }

      frame = requestAnimationFrame(tick);
    }

    render(0);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { rootMargin: "0px 0px -80px 0px" },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      element.textContent = value;
    };
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {value}
    </span>
  );
}
