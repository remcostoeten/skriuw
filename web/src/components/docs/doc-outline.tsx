"use client";

import { useEffect, useRef } from "react";
import type { DocHeading } from "@/lib/docs-content";

type Props = {
  headings: DocHeading[];
};

type Point = { x: number; y: number };

const GEOMETRY = {
  indent: 14,
  rowHeight: 30,
  lineWidth: 1.5,
  corner: 8,
  smoothing: 0.18,
  damping: 0.76,
  anchorFraction: 0.28,
  headerOffset: 65,
};

function roundedPath(points: Point[], radius: number) {
  if (points.length < 2) {
    return "";
  }

  let path = `M ${points[0]!.x} ${points[0]!.y}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;

    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const localRadius = Math.min(radius, incoming / 2, outgoing / 2);

    const startRatio = incoming ? localRadius / incoming : 0;
    const endRatio = outgoing ? localRadius / outgoing : 0;

    const start = {
      x: current.x + (previous.x - current.x) * startRatio,
      y: current.y + (previous.y - current.y) * startRatio,
    };
    const end = {
      x: current.x + (next.x - current.x) * endRatio,
      y: current.y + (next.y - current.y) * endRatio,
    };

    path += ` L ${start.x} ${start.y}`;
    path += ` Q ${current.x} ${current.y} ${end.x} ${end.y}`;
  }

  const last = points.at(-1)!;
  path += ` L ${last.x} ${last.y}`;

  return path;
}

function buildPathPoints(nav: HTMLElement, links: HTMLElement[], depths: number[]) {
  const navRect = nav.getBoundingClientRect();
  const points: Point[] = [];
  const anchorIndices: number[] = [];
  const xBase = 7;

  links.forEach((link, index) => {
    const rect = link.getBoundingClientRect();
    const x = xBase + depths[index]! * GEOMETRY.indent;
    const y = rect.top - navRect.top + rect.height / 2;

    if (points.length === 0) {
      points.push({ x, y: Math.max(2, rect.top - navRect.top + 2) });
    }

    const previous = points.at(-1)!;

    if (Math.abs(previous.x - x) > 0.01) {
      const direction = x > previous.x ? 1 : -1;
      const bridgeY = Math.max(previous.y + 8, y - rect.height * 0.58);
      points.push({ x: previous.x, y: bridgeY });
      points.push({ x: x - direction * Math.min(2, GEOMETRY.corner * 0.18), y: bridgeY });
    }

    points.push({ x, y });
    anchorIndices.push(points.length - 1);
  });

  return { points, anchors: anchorIndices };
}

function findLengthAtPoint(path: SVGPathElement, pathLength: number, point: Point) {
  if (!pathLength) {
    return 0;
  }

  let low = 0;
  let high = pathLength;
  let best = 0;
  let bestDistance = Infinity;

  for (let pass = 0; pass < 4; pass += 1) {
    const steps = 36;
    const span = high - low;

    for (let index = 0; index <= steps; index += 1) {
      const length = low + (span * index) / steps;
      const sample = path.getPointAtLength(length);
      const distance = Math.hypot(sample.x - point.x, sample.y - point.y);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = length;
      }
    }

    const radius = span / steps;
    low = Math.max(0, best - radius);
    high = Math.min(pathLength, best + radius);
  }

  return best;
}

export function DocOutline({ headings }: Props) {
  const navRef = useRef<HTMLElement | null>(null);
  const baseRef = useRef<SVGPathElement | null>(null);
  const activeRef = useRef<SVGPathElement | null>(null);
  const dotRef = useRef<SVGCircleElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  const minDepth = Math.min(...headings.map((heading) => heading.depth));

  useEffect(() => {
    const nav = navRef.current;
    const basePath = baseRef.current;
    const activePath = activeRef.current;
    const dot = dotRef.current;
    const list = listRef.current;

    if (!nav || !basePath || !activePath || !dot || !list) {
      return;
    }

    const links = [...list.querySelectorAll<HTMLAnchorElement>("a")];
    const targets = links.map((link) =>
      document.getElementById(decodeURIComponent(link.hash.slice(1))),
    );
    const depths = links.map((link) => Number(link.dataset.depth ?? 0));

    if (links.length === 0) {
      return;
    }

    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

    let anchors: number[] = [];
    let pathLength = 0;
    let rendered = 0;
    let target = 0;
    let velocity = 0;
    let frame = 0;
    let dirty = true;
    let disposed = false;
    let lastCurrent = -1;

    function renderGeometry() {
      const { points, anchors: anchorIndices } = buildPathPoints(nav!, links, depths);
      const path = roundedPath(points, GEOMETRY.corner);

      basePath!.setAttribute("d", path);
      activePath!.setAttribute("d", path);

      pathLength = activePath!.getTotalLength();
      activePath!.style.strokeDasharray = `${pathLength}`;

      anchors = anchorIndices.map((index) =>
        findLengthAtPoint(activePath!, pathLength, points[index]!),
      );

      rendered = Math.min(rendered, pathLength);
      target = Math.min(target, pathLength);
      dirty = false;
    }

    function getScrollState() {
      const anchorY =
        GEOMETRY.headerOffset +
        (window.innerHeight - GEOMETRY.headerOffset) * GEOMETRY.anchorFraction;
      const positions = targets.map((element) =>
        element ? element.getBoundingClientRect().top : Number.POSITIVE_INFINITY,
      );

      let index = 0;
      while (index < positions.length - 1 && positions[index + 1]! <= anchorY) {
        index += 1;
      }

      const start = positions[index]!;
      const end =
        index < positions.length - 1
          ? positions[index + 1]!
          : Math.max(start + window.innerHeight * 0.5, window.innerHeight);

      const raw = (anchorY - start) / Math.max(1, end - start);

      return { index, progress: Math.max(0, Math.min(1, raw)) };
    }

    function revealCurrent(link: HTMLElement | undefined) {
      const viewport = nav!.closest<HTMLElement>("[data-outline-scroll]");

      if (!link || !viewport || viewport.scrollHeight <= viewport.clientHeight) {
        return;
      }

      const linkRect = link.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const margin = GEOMETRY.rowHeight;

      if (linkRect.top < viewportRect.top + margin) {
        viewport.scrollTop -= viewportRect.top + margin - linkRect.top;
        return;
      }

      if (linkRect.bottom > viewportRect.bottom - margin) {
        viewport.scrollTop += linkRect.bottom - (viewportRect.bottom - margin);
      }
    }

    function updateTarget() {
      if (!pathLength || anchors.length === 0) {
        return;
      }

      const state = getScrollState();
      const start = anchors[state.index] ?? 0;
      const end = anchors[state.index + 1] ?? pathLength;
      target = start + (end - start) * state.progress;

      links.forEach((link, index) => {
        link.dataset.active = String(index < state.index);
        link.dataset.current = String(index === state.index);
      });

      if (state.index !== lastCurrent) {
        lastCurrent = state.index;
        revealCurrent(links[state.index]);
      }
    }

    function draw() {
      if (!pathLength) {
        return;
      }

      activePath!.style.strokeDashoffset = `${Math.max(0, pathLength - rendered)}`;
      const point = activePath!.getPointAtLength(Math.max(0, Math.min(pathLength, rendered)));
      dot!.setAttribute("cx", String(point.x));
      dot!.setAttribute("cy", String(point.y));
    }

    function step() {
      frame = 0;

      if (nav!.offsetParent === null) {
        dirty = true;
        return;
      }

      if (dirty) {
        renderGeometry();
      }

      updateTarget();

      const difference = target - rendered;

      if (reduceMotion.matches) {
        rendered = target;
        velocity = 0;
      } else {
        velocity += difference * GEOMETRY.smoothing;
        velocity *= GEOMETRY.damping;
        rendered += velocity;
      }

      draw();

      const moving = Math.abs(target - rendered) > 0.04 || Math.abs(velocity) > 0.04;

      if ((moving || dirty) && !disposed) {
        frame = requestAnimationFrame(step);
      }
    }

    function startLoop() {
      if (!frame && !disposed) {
        frame = requestAnimationFrame(step);
      }
    }

    function onScroll() {
      startLoop();
    }

    function onResize() {
      dirty = true;
      startLoop();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    const navObserver = new ResizeObserver(onResize);
    navObserver.observe(nav);

    startLoop();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      navObserver.disconnect();
    };
  }, [headings]);

  return (
    <nav ref={navRef} aria-label="On this page" className="doc-outline relative min-h-0">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        <path
          ref={baseRef}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={GEOMETRY.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          ref={activeRef}
          fill="none"
          stroke="var(--color-ink-700)"
          strokeWidth={GEOMETRY.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle ref={dotRef} r="2.2" fill="var(--color-ink-900)" />
      </svg>

      <ol ref={listRef} className="relative z-[1] m-0 grid list-none gap-0.5 p-0">
        {headings.map((heading) => (
          <li key={heading.id} className="min-w-0">
            <a
              href={`#${heading.id}`}
              data-depth={heading.depth - minDepth}
              style={{ paddingLeft: `${22 + (heading.depth - minDepth) * GEOMETRY.indent}px` }}
              className="relative flex min-h-[30px] items-center truncate rounded-md pr-2 text-[13px] leading-[18px] text-ink-400 no-underline transition-colors duration-150 hover:bg-ink-100 hover:text-ink-900 data-[active=true]:text-ink-500 data-[current=true]:font-medium data-[current=true]:text-ink-900"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
