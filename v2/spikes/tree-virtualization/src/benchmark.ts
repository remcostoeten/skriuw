import {
  EVENT_TIMING_MIN_THRESHOLD_MS,
  estimateFrameDuration,
  measureScenario,
  observeBlocking,
  summarize,
  supportsEntryType,
} from "./metrics";
import { allFolderIds, ancestorIds, buildTreeIndex, flattenVisible, referenceFlatten, validateProjection } from "./tree";
import { OVERSCAN_ROWS, ROW_HEIGHT_PX, createTreeView } from "./view";
import type { TreeView } from "./view";
import type {
  BenchmarkResult,
  CorrectnessCheck,
  EventTimingSample,
  MemoryPerformance,
  ScenarioResult,
  TreeIndex,
  TreeNode,
  TreeProjection,
  TrustedKeyResult,
} from "./types";

export type Harness = {
  projection: TreeProjection;
  index: TreeIndex;
  view: TreeView;
  fetchMs: number;
  parseMs: number;
  indexMs: number;
  initialFlattenMs: number;
  initialRenderMs: number;
  hydrationCalls: () => number;
};

let hydrationCallCount = 0;

export async function hydrate(fixtureName: string, host: HTMLElement): Promise<Harness> {
  hydrationCallCount += 1;
  const fetchStart = performance.now();
  const response = await fetch(`fixtures/${fixtureName}.json`);
  if (!response.ok) {
    throw new Error(`fixture ${fixtureName} unavailable (${response.status})`);
  }
  const body = await response.text();
  const fetchEnd = performance.now();
  const projection = JSON.parse(body) as TreeProjection;
  const parseEnd = performance.now();
  const index = buildTreeIndex(projection.nodes);
  const indexEnd = performance.now();

  const expandedAll = allFolderIds(index);
  const flattenStart = performance.now();
  flattenVisible(index, new Set(expandedAll));
  const flattenEnd = performance.now();

  const view = createTreeView(host, `Fixture ${fixtureName}`);
  const renderStart = performance.now();
  view.setTree(index, expandedAll);
  view.layoutHeight();
  const renderEnd = performance.now();

  return {
    projection,
    index,
    view,
    fetchMs: fetchEnd - fetchStart,
    parseMs: parseEnd - fetchEnd,
    indexMs: indexEnd - parseEnd,
    initialFlattenMs: flattenEnd - flattenStart,
    initialRenderMs: renderEnd - renderStart,
    hydrationCalls: () => hydrationCallCount,
  };
}

function check(name: string, pass: boolean, detail: string): CorrectnessCheck {
  return { name, pass, detail };
}

function renderedRowCap(view: TreeView): number {
  const viewportHeight = view.element().clientHeight || 1;
  return Math.ceil(viewportHeight / ROW_HEIGHT_PX) + 1 + OVERSCAN_ROWS * 2;
}

function descendantIds(index: TreeIndex, rootId: string): Set<string> {
  const descendants = new Set<string>();
  const stack = [...(index.childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      break;
    }
    descendants.add(node.id);
    stack.push(...(index.childrenByParent.get(node.id) ?? []));
  }
  return descendants;
}

function shallowFolder(index: TreeIndex): TreeNode | null {
  const roots = index.childrenByParent.get(null) ?? [];
  let best: TreeNode | null = null;
  let bestChildren = -1;
  for (const node of roots) {
    if (node.kind !== "folder") {
      continue;
    }
    const childCount = index.childrenByParent.get(node.id)?.length ?? 0;
    if (childCount > bestChildren) {
      best = node;
      bestChildren = childCount;
    }
  }
  return best;
}

function deepestFolder(index: TreeIndex): TreeNode | null {
  let best: TreeNode | null = null;
  for (const node of index.order) {
    if (node.kind === "folder" && (best === null || node.depth > best.depth)) {
      best = node;
    }
  }
  return best;
}

function flattenEquals(view: TreeView, index: TreeIndex, expanded: Set<string>): boolean {
  const fast = flattenVisible(index, expanded).map((node) => node.id);
  const reference = referenceFlatten(index, expanded);
  return fast.length === reference.length && fast.every((id, at) => id === reference[at]);
}

function runCorrectness(harness: Harness): CorrectnessCheck[] {
  const { projection, index, view } = harness;
  const checks: CorrectnessCheck[] = [];
  const folders = allFolderIds(index);
  const expandedAll = new Set(folders);

  const issues = validateProjection(projection, index);
  checks.push(
    check(
      "projection-contract",
      issues.length === 0,
      issues.length === 0
        ? `nodes=${projection.metadata.nodeCount} folders=${projection.metadata.folderCount} documents=${projection.metadata.documentCount} maxDepth=${projection.metadata.maxDepth} digest=${projection.operationsDigest}`
        : issues.join("; "),
    ),
  );

  const expansionStates: Array<[string, Set<string>]> = [
    ["all-expanded", expandedAll],
    ["all-collapsed", new Set<string>()],
    ["every-other-folder", new Set(folders.filter((_, at) => at % 2 === 0))],
  ];
  const firstFolder = folders[0];
  if (firstFolder !== undefined) {
    expansionStates.push(["first-folder-only", new Set([firstFolder])]);
  }
  const flattenPass = expansionStates.every(([, expanded]) => flattenEquals(view, index, expanded));
  checks.push(
    check(
      "flatten-matches-reference",
      flattenPass,
      `${expansionStates.length} expansion states compared against the recursive reference flattener`,
    ),
  );

  const collapsible = shallowFolder(index);
  if (collapsible) {
    view.expandAncestors(collapsible.id);
    if (!view.isExpanded(collapsible.id)) {
      view.toggleExpanded(collapsible.id);
    }
    const revealed = view.visibleRows().map((node) => node.id);
    view.toggleExpanded(collapsible.id);
    const hidden = descendantIds(index, collapsible.id);
    const visibleAfter = view.visibleRows();
    const renderedAfter = view.renderedRowIds();
    const noneVisible = visibleAfter.every((node) => !hidden.has(node.id));
    const noneRendered = renderedAfter.every((id) => !hidden.has(id));
    checks.push(
      check(
        "collapsed-descendants-never-render",
        noneVisible && noneRendered,
        `collapsed ${collapsible.id} hides ${hidden.size} descendants from flatten and DOM`,
      ),
    );

    view.toggleExpanded(collapsible.id);
    const reexpanded = view.visibleRows().map((node) => node.id);
    const deterministic =
      revealed.length === reexpanded.length && revealed.every((id, at) => id === reexpanded[at]);
    checks.push(
      check(
        "expansion-order-deterministic",
        deterministic,
        `expansion of ${collapsible.id} reproduces ${revealed.length} visible rows in identical sibling order`,
      ),
    );
  }

  view.setTree(index, folders);
  const middle = Math.floor(view.visibleRows().length / 2);
  const middleNode = view.visibleRows()[middle];
  if (middleNode) {
    view.focus(middleNode.id);
    view.scrollTo(view.visibleRows().length * ROW_HEIGHT_PX);
    const unmounted = !view.renderedRowIds().includes(middleNode.id);
    const stillSelected = view.selectedId() === middleNode.id;
    view.scrollToNode(middleNode.id);
    const row = view
      .element()
      .querySelector(`[data-id="${middleNode.id}"]`);
    const restored = row !== null && row.getAttribute("aria-selected") === "true";
    checks.push(
      check(
        "selection-survives-viewport-movement",
        unmounted && stillSelected && restored,
        `selected ${middleNode.id} unmounted at bottom, selection retained, aria-selected restored on return`,
      ),
    );
  }

  const deep = deepestFolder(index);
  if (deep) {
    const deepChildren = index.childrenByParent.get(deep.id) ?? [];
    const deepNote = deepChildren.find((node) => node.kind === "note");
    if (deepNote) {
      view.expandAncestors(deepNote.id);
      view.focus(deepNote.id);
      const focusedRow = view.element().querySelector(`[data-id="${deepNote.id}"]`);
      const level = focusedRow?.getAttribute("aria-level");
      let steps = 0;
      while (view.focusedId() !== null && steps < 100) {
        const current = view.focusedId();
        const node = current === null ? undefined : index.byId.get(current);
        if (!node || node.parentId === null) {
          break;
        }
        view.handleKey("ArrowLeft");
        steps += 1;
        if (view.focusedId() === current) {
          view.handleKey("ArrowLeft");
        }
      }
      const rootReached =
        view.focusedId() !== null &&
        index.byId.get(view.focusedId() ?? "")?.parentId === null;
      checks.push(
        check(
          "deep-parent-navigation",
          level === String(deepNote.depth) && deepNote.depth === projection.metadata.maxDepth && rootReached,
          `aria-level ${level} equals fixture maxDepth ${projection.metadata.maxDepth}; ArrowLeft reached a root node in ${steps} steps`,
        ),
      );

      const ancestors = ancestorIds(index, deepNote.id);
      const topAncestor = ancestors[0];
      if (topAncestor !== undefined) {
        view.setTree(index, folders);
        view.expandAncestors(deepNote.id);
        view.focus(deepNote.id);
        view.toggleExpanded(topAncestor);
        const reassigned = view.selectedId();
        const reassignedVisible = view
          .visibleRows()
          .some((node) => node.id === reassigned);
        view.handleKey("ArrowDown");
        const afterMove = view.selectedId();
        const afterMoveVisible = view
          .visibleRows()
          .some((node) => node.id === afterMove);
        checks.push(
          check(
            "keyboard-never-selects-unavailable",
            reassigned === topAncestor && reassignedVisible && afterMoveVisible,
            `collapsing ${topAncestor} reassigned selection from hidden ${deepNote.id} to the collapsed ancestor; ArrowDown stayed on a visible row`,
          ),
        );
      }
    }
  }

  view.setTree(index, folders);
  const cap = renderedRowCap(view);
  view.scrollTo(Math.floor((view.visibleRows().length * ROW_HEIGHT_PX) / 2));
  const bounded = view.renderedRowCount() <= cap && view.maxRenderedRows() <= cap;
  checks.push(
    check(
      "rendered-rows-bounded",
      bounded,
      `rendered=${view.renderedRowCount()} peak=${view.maxRenderedRows()} cap=${cap} for ${view.visibleRows().length} visible rows`,
    ),
  );

  view.scrollTo(0);
  const rowA = view.visibleRows()[2];
  const rowB = view.visibleRows()[4];
  if (rowA && rowB) {
    view.select(rowA.id);
    const before = view.counters().mutatedRows;
    view.select(rowB.id);
    const mutated = view.counters().mutatedRows - before;
    checks.push(
      check(
        "selection-only-mutation-bounded",
        mutated <= 2,
        `selection change ${rowA.id} -> ${rowB.id} mutated ${mutated} rendered rows`,
      ),
    );
  }

  checks.push(
    check("host-mounts-one", view.counters().hostMounts === 1, `hostMounts=${view.counters().hostMounts}`),
  );

  return checks;
}

async function runScenarios(harness: Harness, estimatedFrameMs: number): Promise<ScenarioResult[]> {
  const { index, view } = harness;
  const folders = allFolderIds(index);
  const scenarios: ScenarioResult[] = [];
  const layoutProbe = () => view.layoutHeight();
  const mutatedProbe = () => view.counters().mutatedRows;

  view.setTree(index, folders);
  const rowCount = view.visibleRows().length;
  const firstRow = view.visibleRows()[0];
  if (firstRow) {
    view.focus(firstRow.id);
  }

  const moves: string[] = [
    ...Array.from({ length: 40 }, () => "ArrowDown"),
    ...Array.from({ length: 20 }, () => "ArrowUp"),
    "End",
    ...Array.from({ length: 20 }, () => "ArrowUp"),
    "Home",
    ...Array.from({ length: 18 }, () => "ArrowDown"),
  ];
  scenarios.push(
    await measureScenario(
      "keyboard-selection-100",
      moves.length,
      estimatedFrameMs,
      layoutProbe,
      mutatedProbe,
      (sampleIndex) => {
        view.handleKey(moves[Math.max(0, sampleIndex)] ?? "ArrowDown");
      },
    ),
  );

  const shallow = shallowFolder(index);
  if (shallow) {
    scenarios.push(
      await measureScenario(
        "expand-collapse-shallow",
        40,
        estimatedFrameMs,
        layoutProbe,
        mutatedProbe,
        () => {
          view.toggleExpanded(shallow.id);
        },
        () => {
          view.scrollTo(0);
        },
      ),
    );
  }

  const deep = deepestFolder(index);
  if (deep && deep.depth > 1) {
    view.setTree(index, folders);
    view.scrollToNode(deep.id);
    scenarios.push(
      await measureScenario(
        "expand-collapse-deep",
        40,
        estimatedFrameMs,
        layoutProbe,
        mutatedProbe,
        () => {
          view.toggleExpanded(deep.id);
        },
      ),
    );
  }

  view.setTree(index, folders);
  const fullHeight = rowCount * ROW_HEIGHT_PX;
  const jumpOffsets = [0, fullHeight / 2, fullHeight, fullHeight / 2, 0];
  scenarios.push(
    await measureScenario(
      "scroll-jumps",
      30,
      estimatedFrameMs,
      layoutProbe,
      mutatedProbe,
      (sampleIndex) => {
        const offset = jumpOffsets[Math.max(0, sampleIndex) % jumpOffsets.length] ?? 0;
        view.scrollTo(offset);
      },
    ),
  );

  if (deep) {
    const deepNotes = (index.childrenByParent.get(deep.id) ?? []).filter(
      (node) => node.kind === "note",
    );
    const ancestors = deep.kind === "folder" ? [...ancestorIds(index, deep.id), deep.id] : [];
    if (deepNotes.length > 0 && ancestors.length > 0) {
      scenarios.push(
        await measureScenario(
          "reveal-selected-descendant",
          20,
          estimatedFrameMs,
          layoutProbe,
          mutatedProbe,
          (sampleIndex) => {
            const target = deepNotes[Math.max(0, sampleIndex) % deepNotes.length];
            if (target) {
              view.expandAncestors(target.id);
              view.focus(target.id);
            }
          },
          () => {
            view.setTree(
              index,
              folders.filter((id) => !ancestors.includes(id)),
            );
            view.scrollTo(0);
          },
        ),
      );
    }
  }

  const expandedAll = new Set(folders);
  scenarios.push(
    await measureScenario(
      "visible-row-recompute",
      50,
      estimatedFrameMs,
      () => 0,
      mutatedProbe,
      () => {
        flattenVisible(index, expandedAll);
      },
    ),
  );

  view.setTree(index, folders);
  const restored = view.visibleRows()[0];
  if (restored) {
    view.focus(restored.id);
  }
  return scenarios;
}

export async function runBenchmark(fixtureName: string, host: HTMLElement): Promise<BenchmarkResult> {
  const harness = await hydrate(fixtureName, host);
  const hydrationBefore = harness.hydrationCalls();
  const estimatedFrameMs = await estimateFrameDuration();
  const correctness = runCorrectness(harness);
  const scenarios = await runScenarios(harness, estimatedFrameMs);
  const hydrationAfter = harness.hydrationCalls();
  correctness.push(
    check(
      "no-hydration-during-measurement",
      hydrationAfter === hydrationBefore,
      `hydration calls before=${hydrationBefore} after=${hydrationAfter}`,
    ),
  );

  const unsupportedApis: string[] = [];
  if (!supportsEntryType("longtask")) {
    unsupportedApis.push("longtask");
  }
  if (!supportsEntryType("long-animation-frame")) {
    unsupportedApis.push("long-animation-frame");
  }
  if (!supportsEntryType("event")) {
    unsupportedApis.push("event-timing");
  }
  if (!(performance as MemoryPerformance).measureUserAgentSpecificMemory) {
    unsupportedApis.push("measureUserAgentSpecificMemory");
  }

  return {
    fixture: harness.projection.metadata,
    operationsDigest: harness.projection.operationsDigest,
    rowHeightPx: ROW_HEIGHT_PX,
    viewportHeightPx: harness.view.element().clientHeight,
    overscanRows: OVERSCAN_ROWS,
    fetchMs: harness.fetchMs,
    parseMs: harness.parseMs,
    indexMs: harness.indexMs,
    initialFlattenMs: harness.initialFlattenMs,
    initialRenderMs: harness.initialRenderMs,
    visibleRowCount: harness.view.visibleRows().length,
    renderedRowCount: harness.view.renderedRowCount(),
    totalDomElements: document.querySelectorAll("*").length,
    hostMounts: harness.view.counters().hostMounts,
    hydrationCallsDuringMeasurement: hydrationAfter - hydrationBefore,
    estimatedFrameMs,
    scenarios,
    correctness,
    unsupportedApis,
    measuredAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    buildMode: import.meta.env.MODE,
  };
}

export type TrustedKeyCapture = {
  harness: Harness;
  finish(): TrustedKeyResult;
};

export async function prepareTrustedKeys(
  fixtureName: string,
  host: HTMLElement,
): Promise<TrustedKeyCapture> {
  const harness = await hydrate(fixtureName, host);
  const view = harness.view;
  const first = view.visibleRows()[0];
  if (first) {
    view.focus(first.id);
  }
  const estimatedFrameMs = await estimateFrameDuration();
  const blocking = observeBlocking();
  const startedAt = performance.now();

  const samples: Array<{ started: number; sync: number; layout: number }> = [];
  let pending: { started: number } | null = null;
  const onCaptureKeydown = (event: KeyboardEvent) => {
    if (event.isTrusted && event.key === "ArrowDown") {
      pending = { started: performance.now() };
    }
  };
  view.element().addEventListener("keydown", onCaptureKeydown, { capture: true });
  const onBubbleKeydown = (event: KeyboardEvent) => {
    if (!pending || !event.isTrusted || event.key !== "ArrowDown") {
      return;
    }
    const sync = performance.now();
    view.layoutHeight();
    const layout = performance.now();
    samples.push({ started: pending.started, sync, layout });
    pending = null;
  };
  view.element().addEventListener("keydown", onBubbleKeydown);

  const eventEntries: EventTimingSample[] = [];
  const eventSupported = supportsEntryType("event");
  const eventObserver = eventSupported
    ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const timing = entry as PerformanceEntry & {
            processingStart: number;
            processingEnd: number;
          };
          if (entry.name === "keydown") {
            eventEntries.push({
              name: entry.name,
              processingMs: timing.processingEnd - timing.processingStart,
              durationMs: entry.duration,
            });
          }
        }
      })
    : null;
  eventObserver?.observe({
    type: "event",
    buffered: false,
    durationThreshold: EVENT_TIMING_MIN_THRESHOLD_MS,
  } as PerformanceObserverInit);

  return {
    harness,
    finish() {
      const endedAt = performance.now();
      view.element().removeEventListener("keydown", onCaptureKeydown, { capture: true });
      view.element().removeEventListener("keydown", onBubbleKeydown);
      eventObserver?.disconnect();
      const { longTasks, longFrames } = blocking.stop(startedAt, endedAt);
      const timing = samples.map((sample, at) => ({
        index: at,
        syncMs: sample.sync - sample.started,
        layoutMs: sample.layout - sample.sync,
        settledMs: sample.layout - sample.started,
        nextFrameMs: 0,
        frameGapMs: 0,
        mutatedRows: 0,
      }));
      return {
        keydownCount: samples.length,
        handler: {
          name: "trusted-keydown-handler",
          samples: timing,
          sync: summarize(timing.map((sample) => sample.syncMs)),
          layout: summarize(timing.map((sample) => sample.layoutMs)),
          settled: summarize(timing.map((sample) => sample.settledMs)),
          nextFrame: summarize([]),
          droppedFrames: 0,
          maxMutatedRows: 0,
          longTasks,
          longFrames,
        },
        eventTiming: {
          supported: eventSupported,
          durationThresholdMs: EVENT_TIMING_MIN_THRESHOLD_MS,
          entries: eventEntries,
        },
      };
    },
  };
}
