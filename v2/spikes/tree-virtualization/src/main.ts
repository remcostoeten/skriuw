import "./styles.css";
import { hydrate, prepareTrustedKeys, runBenchmark } from "./benchmark";
import type { Harness, TrustedKeyCapture } from "./benchmark";
import { renderGallery } from "./gallery";
import type { BenchmarkResult, CorrectnessCheck, ScenarioResult, TrustedKeyResult } from "./types";

type AutomationApi = {
  run(fixtureName: string): Promise<BenchmarkResult>;
  prepareTrusted(fixtureName: string): Promise<number>;
  finishTrusted(): TrustedKeyResult;
  galleryChecks(): CorrectnessCheck[];
};

declare global {
  var __SKRIUW_TREE_BENCHMARK__: AutomationApi;
  var __SKRIUW_TREE_RESULT__: BenchmarkResult | undefined;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`harness markup missing ${selector}`);
  }
  return element;
}

const treeHost = requireElement<HTMLElement>("#tree-host");
const galleryHost = requireElement<HTMLElement>("#gallery");
const resultsHost = requireElement<HTMLElement>("#results");
const statusLine = requireElement<HTMLElement>("#status");
const fixtureSelect = requireElement<HTMLSelectElement>("#fixture-select");
const loadButton = requireElement<HTMLButtonElement>("#load-button");
const runButton = requireElement<HTMLButtonElement>("#run-button");

const galleryChecks = renderGallery(galleryHost);

let interactiveHarness: Harness | null = null;
let trustedCapture: TrustedKeyCapture | null = null;
let taskRunning = false;

function setStatus(message: string): void {
  statusLine.textContent = message;
}

function setControlsDisabled(disabled: boolean): void {
  loadButton.disabled = disabled;
  runButton.disabled = disabled;
  fixtureSelect.disabled = disabled;
}

function assertIdle(): void {
  if (taskRunning) {
    throw new Error("a tree harness task is already running");
  }
  if (trustedCapture) {
    throw new Error("finish the trusted-key capture before starting another task");
  }
}

function resetHost(): void {
  interactiveHarness?.view.destroy();
  interactiveHarness = null;
  treeHost.replaceChildren();
}

function formatMs(value: number): string {
  return value.toFixed(2);
}

function scenarioRow(scenario: ScenarioResult): string {
  const cells = [
    scenario.name,
    formatMs(scenario.sync.p50Ms),
    formatMs(scenario.settled.p50Ms),
    formatMs(scenario.settled.p95Ms),
    formatMs(scenario.settled.p99Ms),
    formatMs(scenario.settled.maxMs),
    String(scenario.droppedFrames),
    String(scenario.maxMutatedRows),
    String(scenario.longTasks.count),
    String(scenario.longFrames.count),
  ];
  return `<tr><td>${cells.join("</td><td>")}</td></tr>`;
}

function renderResult(result: BenchmarkResult): void {
  const failing = result.correctness.filter((entry) => !entry.pass);
  const header =
    "<tr><th>Scenario</th><th>Sync P50</th><th>Settled P50</th><th>P95</th><th>P99</th><th>Max</th><th>Dropped</th><th>Rows mutated max</th><th>Long tasks</th><th>LoAF</th></tr>";
  const rows = result.scenarios.map((scenario) => scenarioRow(scenario)).join("");
  const checks = result.correctness
    .map(
      (entry) =>
        `<li class="${entry.pass ? "" : "check-fail"}">${entry.pass ? "✓" : "✗"} ${entry.name}: ${entry.detail}</li>`,
    )
    .join("");
  resultsHost.innerHTML = `
    <h2>${result.fixture.name}</h2>
    <p class="status">rendered rows ${result.renderedRowCount} of ${result.visibleRowCount} visible · ${result.totalDomElements} DOM elements · ${failing.length} failing checks</p>
    <table class="summary-table">${header}${rows}</table>
    <ul>${checks}</ul>
    <details><summary>Raw result JSON</summary><pre>${JSON.stringify(result, null, 2)}</pre></details>
  `;
}

async function loadFixture(fixtureName: string): Promise<void> {
  assertIdle();
  taskRunning = true;
  setControlsDisabled(true);
  try {
    resetHost();
    setStatus(`Loading ${fixtureName}…`);
    interactiveHarness = await hydrate(fixtureName, treeHost);
    const first = interactiveHarness.view.visibleRows()[0];
    if (first) {
      interactiveHarness.view.focus(first.id);
    }
    setStatus(
      `${fixtureName}: ${interactiveHarness.view.visibleRows().length} visible rows, ${interactiveHarness.view.renderedRowCount()} rendered.`,
    );
  } catch (error) {
    setStatus("Fixture failed to load.");
    const message = document.createElement("p");
    message.className = "tree-error";
    message.setAttribute("role", "alert");
    message.textContent = `Fixture ${fixtureName} failed to load: ${String(error)}. Run scripts/export-fixtures.sh and reload.`;
    treeHost.appendChild(message);
    throw error;
  } finally {
    taskRunning = false;
    setControlsDisabled(false);
  }
}

async function runInteractive(fixtureName: string): Promise<BenchmarkResult> {
  assertIdle();
  taskRunning = true;
  setControlsDisabled(true);
  try {
    resetHost();
    setStatus(`Benchmarking ${fixtureName}…`);
    const result = await runBenchmark(fixtureName, treeHost, (harness) => {
      interactiveHarness = harness;
    });
    globalThis.__SKRIUW_TREE_RESULT__ = result;
    renderResult(result);
    setStatus(`Finished ${fixtureName}.`);
    return result;
  } finally {
    taskRunning = false;
    setControlsDisabled(false);
  }
}

loadButton.addEventListener("click", () => {
  void loadFixture(fixtureSelect.value);
});
runButton.addEventListener("click", () => {
  void runInteractive(fixtureSelect.value);
});

globalThis.__SKRIUW_TREE_BENCHMARK__ = {
  run(fixtureName) {
    return runInteractive(fixtureName);
  },
  async prepareTrusted(fixtureName) {
    assertIdle();
    taskRunning = true;
    setControlsDisabled(true);
    try {
      resetHost();
      trustedCapture = await prepareTrustedKeys(fixtureName, treeHost);
      setStatus(`Trusted-key capture armed for ${fixtureName}.`);
      return trustedCapture.harness.view.visibleRows().length;
    } finally {
      taskRunning = false;
      setControlsDisabled(trustedCapture !== null);
    }
  },
  finishTrusted() {
    if (!trustedCapture) {
      throw new Error("trusted capture not prepared");
    }
    const capture = trustedCapture;
    try {
      return capture.finish();
    } finally {
      capture.harness.view.destroy();
      treeHost.replaceChildren();
      trustedCapture = null;
      setControlsDisabled(false);
    }
  },
  galleryChecks() {
    return galleryChecks;
  },
};

const query = new URLSearchParams(window.location.search);
const autoFixture = query.get("auto");
if (autoFixture) {
  void runInteractive(autoFixture);
} else {
  void loadFixture(fixtureSelect.value);
}
