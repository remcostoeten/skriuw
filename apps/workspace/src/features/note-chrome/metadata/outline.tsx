import { useEffect, useRef, useState } from "react";
import { SECONDARY_PANE_ID } from "@skriuw/renderer-core/store/panes";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { GEOMETRY, lengthAtY, pathPoints, roundedPath } from "./outline-geometry";
import { planOutlineRebind, selectOutlineSource } from "./outline-source";

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

type EditorHostRefs = {
  scrollHost: HTMLElement;
  proseHost: HTMLElement;
};

const HEADING_SELECTOR = "h1, h2, h3, h4";

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

type OutlineController = {
  restart: () => void;
  destroy: () => void;
};

function containsHeading(nodes: NodeList): boolean {
  for (const node of nodes) {
    if (
      node instanceof Element &&
      (node.matches(HEADING_SELECTOR) || node.querySelector(HEADING_SELECTOR) !== null)
    ) {
      return true;
    }
  }
  return false;
}

function touchesHeading(record: MutationRecord, proseHost: HTMLElement): boolean {
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  const heading = target?.closest(HEADING_SELECTOR);
  if (heading && proseHost.contains(heading)) {
    return true;
  }
  if (record.type !== "childList") {
    return false;
  }
  return containsHeading(record.addedNodes) || containsHeading(record.removedNodes);
}

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
  const viewport = nav.closest<HTMLElement>("[data-outline-scroll]");

  let items: OutlineItem[] = [];
  let links: HTMLElement[] = [];
  let anchors: number[] = [];
  let pathLength = 0;
  let rendered = 0;
  let target = 0;
  let velocity = 0;
  let frame = 0;
  let mutationFrame = 0;
  let dirty = true;
  let disposed = false;
  let visible = true;
  let rebuildPending = false;
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
      return (
        previous.element === item.element &&
        previous.label === item.label &&
        previous.depth === item.depth
      );
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
    lastCurrent = -1;
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
          behavior: "smooth",
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

    const navRect = nav.getBoundingClientRect();
    const rows = links.map((link, index) => {
      const rect = link.getBoundingClientRect();
      return { depth: items[index]!.depth, top: rect.top - navRect.top, height: rect.height };
    });
    const { points, anchors: anchorIndices } = pathPoints(rows);
    const path = roundedPath(points, GEOMETRY.corner);

    basePath.setAttribute("d", path);
    activePath.setAttribute("d", path);

    pathLength = activePath.getTotalLength();
    activePath.style.strokeDasharray = `${pathLength}`;

    anchors = anchorIndices.map((index) =>
      lengthAtY((length) => activePath.getPointAtLength(length), pathLength, points[index]!.y),
    );

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

  function measureReveal(link: HTMLElement | undefined): number {
    if (!link || !viewport || viewport.scrollHeight <= viewport.clientHeight) {
      return 0;
    }

    const linkRect = link.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const margin = GEOMETRY.rowHeight;

    if (linkRect.top < viewportRect.top + margin) {
      return linkRect.top - (viewportRect.top + margin);
    }
    if (linkRect.bottom > viewportRect.bottom - margin) {
      return linkRect.bottom - (viewportRect.bottom - margin);
    }
    return 0;
  }

  function writeLinkStates(index: number): void {
    const from = lastCurrent < 0 ? 0 : Math.min(lastCurrent, index);
    const to = lastCurrent < 0 ? links.length - 1 : Math.max(lastCurrent, index);
    for (let position = from; position <= to; position += 1) {
      const link = links[position];
      if (link) {
        link.dataset.active = String(position < index);
        link.dataset.current = String(position === index);
      }
    }
    lastCurrent = index;
  }

  function updateTarget(): void {
    if (!pathLength || anchors.length === 0) {
      return;
    }

    const state = getScrollState();
    const start = anchors[state.index] ?? 0;
    const end = anchors[state.index + 1] ?? pathLength;
    target = start + (end - start) * state.progress;

    if (state.index === lastCurrent) {
      return;
    }

    const scrollOffset = measureReveal(links[state.index]);
    writeLinkStates(state.index);
    if (viewport && scrollOffset !== 0) {
      viewport.scrollTop += scrollOffset;
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
    velocity += difference * GEOMETRY.smoothing;
    velocity *= GEOMETRY.damping;
    rendered += velocity;

    draw();

    const moving = Math.abs(target - rendered) > 0.04 || Math.abs(velocity) > 0.04;
    if ((moving || dirty) && !disposed && visible) {
      frame = requestAnimationFrame(step);
    }
  }

  function startLoop(): void {
    if (!frame && !disposed && visible) {
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

  function onMutate(records: MutationRecord[]): void {
    if (!rebuildPending && records.some((record) => touchesHeading(record, refs.proseHost))) {
      rebuildPending = true;
    }
    if (mutationFrame) {
      return;
    }
    mutationFrame = requestAnimationFrame(() => {
      mutationFrame = 0;
      if (rebuildPending) {
        rebuildPending = false;
        rebuildList();
      }
      startLoop();
    });
  }

  refs.scrollHost.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });

  const navResizeObserver = new ResizeObserver(onResize);
  navResizeObserver.observe(nav);

  const visibilityObserver = new IntersectionObserver((entries) => {
    const entry = entries.at(-1);
    if (!entry) {
      return;
    }
    visible = entry.isIntersecting;
    if (visible) {
      dirty = true;
      startLoop();
    }
  });
  visibilityObserver.observe(nav);

  const mutationObserver = new MutationObserver((records) => onMutate(records));
  mutationObserver.observe(refs.proseHost, { childList: true, subtree: true, characterData: true });

  rebuildList();
  startLoop();

  return {
    restart(): void {
      rendered = 0;
      velocity = 0;
      dirty = true;
      startLoop();
    },
    destroy(): void {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(mutationFrame);
      refs.scrollHost.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      navResizeObserver.disconnect();
      visibilityObserver.disconnect();
      itemObserver.disconnect();
      mutationObserver.disconnect();
      nav.innerHTML = "";
    },
  };
}

function selectHasActiveNote(state: RendererState): boolean {
  return state.activeNoteId !== null;
}

function selectFocusedPaneId(state: RendererState): string {
  return state.focusedPaneId;
}

export function NoteOutline({ store, onCountChange }: Props) {
  const hasActiveNote = useRendererSelector(store, selectHasActiveNote);
  const source = useRendererSelector(store, selectOutlineSource);
  const focusedPaneId = useRendererSelector(store, selectFocusedPaneId);
  const navRef = useRef<HTMLElement | null>(null);
  const sourceChangedRef = useRef<(() => void) | null>(null);
  const [, setEmpty] = useState(true);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !hasActiveNote) {
      setEmpty(true);
      return;
    }

    const paneIndex = focusedPaneId === SECONDARY_PANE_ID ? 1 : 0;
    let disposed = false;
    let attempts = 0;
    let retryFrame = 0;
    let controller: OutlineController | null = null;
    let mountedHost: HTMLElement | null = null;

    function tryMount(): void {
      retryFrame = 0;
      if (disposed) {
        return;
      }
      const refs = locateEditorHost(paneIndex);
      if (!refs) {
        if (attempts++ < 60) {
          retryFrame = requestAnimationFrame(tryMount);
        }
        return;
      }
      mountedHost = refs.proseHost;
      controller = mountOutlineController(nav!, refs, (count) => {
        setEmpty(count === 0);
        onCountChange?.(count);
      });
    }

    function onSourceChanged(): void {
      if (disposed) {
        return;
      }
      const currentHost = locateEditorHost(paneIndex)?.proseHost ?? null;
      if (controller && planOutlineRebind(mountedHost, currentHost) === "restart") {
        controller.restart();
        return;
      }
      if (controller) {
        controller.destroy();
        setEmpty(true);
        onCountChange?.(0);
      }
      controller = null;
      mountedHost = null;
      cancelAnimationFrame(retryFrame);
      attempts = 0;
      tryMount();
    }

    sourceChangedRef.current = onSourceChanged;
    tryMount();

    return () => {
      disposed = true;
      sourceChangedRef.current = null;
      cancelAnimationFrame(retryFrame);
      controller?.destroy();
    };
  }, [hasActiveNote, focusedPaneId, onCountChange]);

  useEffect(() => {
    sourceChangedRef.current?.();
  }, [source]);

  return <nav ref={navRef} aria-label="Note outline" className="relative min-h-0" />;
}
