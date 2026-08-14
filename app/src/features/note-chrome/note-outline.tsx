import { useEffect, useRef, useState } from "react";
import { SECONDARY_PANE_ID } from "@/store/panes";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";

type Props = {
  store: RendererStore;
  onCountChange?: (count: number) => void;
};

type OutlineItem = {
  id: string;
  label: string;
  depth: number;
  element: HTMLElement;
};

type Point = { x: number; y: number };

type EditorHostRefs = {
  scrollHost: HTMLElement;
  proseHost: HTMLElement;
};

const HEADING_SELECTOR = "h1, h2, h3, h4";

const GEOMETRY = {
  indent: 14,
  rowHeight: 30,
  rowGap: 2,
  lineWidth: 1.5,
  corner: 8,
  smoothing: 0.18,
  damping: 0.76,
  anchorFraction: 0.28,
};

function slugify(text: string, index: number): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "section"}-${index}`;
}

function collectOutlineItems(proseHost: HTMLElement): OutlineItem[] {
  const elements = [...proseHost.querySelectorAll<HTMLElement>(HEADING_SELECTOR)];
  if (elements.length === 0) {
    return [];
  }
  const minLevel = Math.min(...elements.map((element) => Number(element.tagName[1])));
  return elements.map((element, index) => ({
    id: slugify(element.textContent ?? "", index),
    label: element.textContent?.trim() || "Untitled",
    depth: Number(element.tagName[1]) - minLevel,
    element,
  }));
}

function locateEditorHost(paneIndex: number): EditorHostRefs | null {
  const panes = document.querySelectorAll<HTMLElement>(".editor-pane");
  const pane = panes[paneIndex];
  if (!pane) {
    return null;
  }
  const scrollHost = pane.querySelector<HTMLElement>(".editor-scroll");
  const proseHost = pane.querySelector<HTMLElement>(".prosemirror-host");
  if (!scrollHost || !proseHost) {
    return null;
  }
  return { scrollHost, proseHost };
}

function roundedPath(points: Point[], radius: number): string {
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

function buildPathPoints(nav: HTMLElement, links: HTMLElement[], items: OutlineItem[]): {
  points: Point[];
  anchors: number[];
} {
  const navRect = nav.getBoundingClientRect();
  const points: Point[] = [];
  const anchorIndices: number[] = [];
  const xBase = 7;

  links.forEach((link, index) => {
    const rect = link.getBoundingClientRect();
    const x = xBase + items[index]!.depth * GEOMETRY.indent;
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

function findLengthAtPoint(path: SVGPathElement, pathLength: number, point: Point): number {
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

type OutlineController = {
  destroy: () => void;
};

function mountOutlineController(
  nav: HTMLElement,
  refs: EditorHostRefs,
  onCountChange: (count: number) => void,
): OutlineController {
  nav.innerHTML = `
    <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <path class="fill-none stroke-border" stroke-width="${GEOMETRY.lineWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
      <path class="fill-none" stroke-width="${GEOMETRY.lineWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="stroke: hsl(var(--foreground) / 0.72)"></path>
      <circle r="2.2" style="fill: hsl(var(--foreground) / 0.85)"></circle>
    </svg>
    <ol class="relative z-[1] m-0 grid list-none gap-0.5 p-0"></ol>
    <p class="relative z-[1] m-0 hidden px-2 py-1 text-[12px] leading-5 text-muted-foreground/60" data-empty-state>Add a heading to build the outline.</p>
  `;

  const svg = nav.querySelector("svg")!;
  const basePath = svg.querySelectorAll("path")[0] as SVGPathElement;
  const activePath = svg.querySelectorAll("path")[1] as SVGPathElement;
  const dot = svg.querySelector("circle")!;
  const list = nav.querySelector("ol")!;
  const emptyState = nav.querySelector<HTMLElement>("[data-empty-state]")!;

  let items: OutlineItem[] = [];
  let links: HTMLElement[] = [];
  let anchors: number[] = [];
  let pathLength = 0;
  let rendered = 0;
  let target = 0;
  let velocity = 0;
  let frame = 0;
  let dirty = true;
  let disposed = false;
  let lastCurrent = -1;

  const itemObserver = new ResizeObserver(() => {
    dirty = true;
    startLoop();
  });

  function itemsUnchanged(next: OutlineItem[]): boolean {
    if (next.length !== items.length) {
      return false;
    }
    return next.every((item, index) => {
      const previous = items[index]!;
      return previous.element === item.element && previous.label === item.label && previous.depth === item.depth;
    });
  }

  function rebuildList(): void {
    const nextItems = collectOutlineItems(refs.proseHost);
    onCountChange(nextItems.length);

    const isEmpty = nextItems.length === 0;
    emptyState.classList.toggle("hidden", !isEmpty);
    svg.classList.toggle("hidden", isEmpty);

    if (itemsUnchanged(nextItems)) {
      return;
    }

    items = nextItems;
    list.innerHTML = "";
    itemObserver.disconnect();

    for (const item of items) {
      const row = document.createElement("li");
      row.className = "min-w-0";

      const link = document.createElement("a");
      link.href = `#${item.id}`;
      link.textContent = item.label;
      link.className =
        "relative flex min-h-[30px] items-center truncate rounded-md pr-2 text-[13px] text-muted-foreground/70 no-underline transition-colors duration-150 hover:bg-muted/50 hover:text-foreground data-[active=true]:text-muted-foreground data-[current=true]:font-medium data-[current=true]:text-foreground";
      link.style.paddingLeft = `${22 + item.depth * GEOMETRY.indent}px`;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        item.element.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start",
        });
      });

      row.append(link);
      list.append(row);
      itemObserver.observe(item.element);
    }

    links = [...list.querySelectorAll<HTMLElement>("a")];
    dirty = true;
  }

  function renderGeometry(): void {
    if (links.length === 0) {
      pathLength = 0;
      basePath.setAttribute("d", "");
      activePath.setAttribute("d", "");
      dirty = false;
      return;
    }

    const { points, anchors: anchorIndices } = buildPathPoints(nav, links, items);
    const path = roundedPath(points, GEOMETRY.corner);

    basePath.setAttribute("d", path);
    activePath.setAttribute("d", path);

    pathLength = activePath.getTotalLength();
    activePath.style.strokeDasharray = `${pathLength}`;

    anchors = anchorIndices.map((index) => findLengthAtPoint(activePath, pathLength, points[index]!));

    rendered = Math.min(rendered, pathLength);
    target = Math.min(target, pathLength);
    dirty = false;
  }

  function getScrollState(): { index: number; progress: number } {
    const scrollRect = refs.scrollHost.getBoundingClientRect();
    const anchorY = scrollRect.top + scrollRect.height * GEOMETRY.anchorFraction;
    const positions = items.map((item) => item.element.getBoundingClientRect().top);

    let index = 0;
    while (index < positions.length - 1 && positions[index + 1]! <= anchorY) {
      index += 1;
    }

    const start = positions[index]!;
    const end =
      index < positions.length - 1
        ? positions[index + 1]!
        : Math.max(start + items[index]!.element.getBoundingClientRect().height, scrollRect.bottom);

    const raw = (anchorY - start) / Math.max(1, end - start);
    return { index, progress: Math.max(0, Math.min(1, raw)) };
  }

  function updateTarget(): void {
    if (!pathLength || anchors.length === 0) {
      return;
    }

    const state = getScrollState();
    const start = anchors[state.index] ?? 0;
    const end = anchors[state.index + 1] ?? pathLength;
    target = start + (end - start) * state.progress;

    links.forEach((link, index) => {
      const active = index === state.index;
      link.dataset.active = String(index < state.index);
      link.dataset.current = String(active);
    });

    if (state.index !== lastCurrent) {
      lastCurrent = state.index;
      revealCurrent(links[state.index]);
    }
  }

  function revealCurrent(link: HTMLElement | undefined): void {
    const viewport = nav.closest<HTMLElement>("[data-outline-scroll]");
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

  function draw(): void {
    if (!pathLength) {
      return;
    }
    activePath.style.strokeDashoffset = `${Math.max(0, pathLength - rendered)}`;
    const point = activePath.getPointAtLength(Math.max(0, Math.min(pathLength, rendered)));
    dot.setAttribute("cx", String(point.x));
    dot.setAttribute("cy", String(point.y));
  }

  function step(): void {
    frame = 0;

    if (dirty) {
      renderGeometry();
    }

    updateTarget();

    const difference = target - rendered;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
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

  function startLoop(): void {
    if (!frame && !disposed) {
      frame = requestAnimationFrame(step);
    }
  }

  function onScroll(): void {
    startLoop();
  }

  function onResize(): void {
    dirty = true;
    startLoop();
  }

  let mutationScheduled = false;
  function onMutate(): void {
    if (mutationScheduled) {
      return;
    }
    mutationScheduled = true;
    requestAnimationFrame(() => {
      mutationScheduled = false;
      rebuildList();
      startLoop();
    });
  }

  refs.scrollHost.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });

  const navResizeObserver = new ResizeObserver(onResize);
  navResizeObserver.observe(nav);

  const mutationObserver = new MutationObserver(onMutate);
  mutationObserver.observe(refs.proseHost, { childList: true, subtree: true, characterData: true });

  rebuildList();
  startLoop();

  return {
    destroy(): void {
      disposed = true;
      cancelAnimationFrame(frame);
      refs.scrollHost.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      navResizeObserver.disconnect();
      itemObserver.disconnect();
      mutationObserver.disconnect();
      nav.innerHTML = "";
    },
  };
}

function selectActiveNoteId(state: RendererState): string | null {
  return state.activeNoteId;
}

function selectFocusedPaneId(state: RendererState): string {
  return state.focusedPaneId;
}

export function NoteOutline({ store, onCountChange }: Props) {
  const activeNoteId = useRendererSelector(store, selectActiveNoteId);
  const focusedPaneId = useRendererSelector(store, selectFocusedPaneId);
  const navRef = useRef<HTMLElement | null>(null);
  const [, setEmpty] = useState(true);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || activeNoteId === null) {
      setEmpty(true);
      return;
    }

    const paneIndex = focusedPaneId === SECONDARY_PANE_ID ? 1 : 0;
    let disposed = false;
    let attempts = 0;
    let controller: OutlineController | null = null;

    function tryMount(): void {
      if (disposed) {
        return;
      }
      const refs = locateEditorHost(paneIndex);
      if (!refs) {
        if (attempts++ < 60) {
          requestAnimationFrame(tryMount);
        }
        return;
      }
      controller = mountOutlineController(nav!, refs, (count) => {
        setEmpty(count === 0);
        onCountChange?.(count);
      });
    }

    tryMount();

    return () => {
      disposed = true;
      controller?.destroy();
    };
  }, [activeNoteId, focusedPaneId, onCountChange]);

  return <nav ref={navRef} aria-label="Note outline" className="relative min-h-0" />;
}
