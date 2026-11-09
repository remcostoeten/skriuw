import "./disable-react-performance-tracks";
import { Profiler, StrictMode } from "react";
import type { ProfilerOnRenderCallback } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { App } from "../src/app";
import { installEditorExtensions } from "../src/app/editor-extensions";
import { bindUiPersistence } from "../src/app/ui-persistence";
import { bindSettingsToRoot } from "../src/features/settings/apply-settings";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { createPerformanceSnapshot } from "./fixture";
import type { TreeProjection } from "./fixture";
import { createPerformanceController } from "./harness";
import type { FixtureContent, PerformanceWindow } from "./types";
import { preparedEditorDocuments } from "../src/features/editor/document/prepared";
import "../src/styles.css";
import { invoke, setSearchHits } from "./bridge-mock";

Object.defineProperty(window, "__TAURI_INTERNALS__", {
  value: { invoke, transformCallback: () => 0, unregisterCallback: () => undefined },
});

const pageErrors: string[] = [];

function capturePageErrors(): void {
  const consoleError = console.error.bind(console);
  console.error = (...values: Parameters<typeof console.error>) => {
    pageErrors.push(values.map((value) => String(value)).join(" "));
    consoleError(...values);
  };
  window.addEventListener("error", (event) =>
    pageErrors.push(String(event.error ?? event.message)),
  );
  window.addEventListener("unhandledrejection", (event) => pageErrors.push(String(event.reason)));
}

function fixtureContent(value: string | null): FixtureContent {
  if (value === null || value === "varied") return "varied";
  if (value === "plain") return "plain";
  throw new Error(`unsupported fixture content ${value}`);
}

async function start(): Promise<void> {
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get("capture-errors") === "1") {
    capturePageErrors();
  }
  const fixtureName = parameters.get("fixture") ?? "wide-1000";
  const blockCount = Number(parameters.get("blocks") ?? "50");
  if (![50, 150, 500, 2000].includes(blockCount)) {
    throw new Error(`unsupported block count ${blockCount}`);
  }
  const content = fixtureContent(parameters.get("content"));
  const response = await fetch(`../fixtures/${fixtureName}.json`);
  if (!response.ok) {
    throw new Error(`fixture ${fixtureName} failed with ${response.status}`);
  }
  const projection = (await response.json()) as TreeProjection;
  const { snapshot, identity, references, searchHits } = createPerformanceSnapshot(
    projection,
    blockCount,
    content,
  );
  setSearchHits(searchHits);
  const store = createRendererStore(createInitialState(snapshot, undefined, references));
  bindUiPersistence(store);
  bindSettingsToRoot(store, document.documentElement);
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("missing root container");
  }
  let profilerCallback: ProfilerOnRenderCallback | null = null;
  const onRender: ProfilerOnRenderCallback = (...arguments_) => {
    profilerCallback?.(...arguments_);
  };
  installEditorExtensions();
  const root = createRoot(container);
  const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
  const heapBytesBefore = memory.memory?.usedJSHeapSize ?? null;
  const renderStarted = performance.now();
  flushSync(() => {
    root.render(
      <StrictMode>
        <Profiler id="product-renderer" onRender={onRender}>
          <App store={store} />
        </Profiler>
      </StrictMode>,
    );
  });
  const startupPreparation = {
    renderMs: performance.now() - renderStarted,
    heapBytesBefore,
    heapBytesAfter: memory.memory?.usedJSHeapSize ?? null,
    ...preparedEditorDocuments(store).metrics(),
  };
  const controller = await createPerformanceController(store, identity, startupPreparation, () => [
    ...pageErrors,
  ]);
  profilerCallback = controller.onRender;
  (window as unknown as PerformanceWindow).__SKRIUW_PRODUCT_PERFORMANCE__ = controller;
}

void start().catch((error: unknown) => {
  const container = document.getElementById("root");
  if (container) {
    container.textContent = `Performance fixture failed: ${String(error)}`;
  }
  throw error;
});
