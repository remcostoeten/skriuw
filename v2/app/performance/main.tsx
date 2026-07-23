import { Profiler, StrictMode } from "react";
import type { ProfilerOnRenderCallback } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { App } from "../src/app";
import { bindSettingsToRoot } from "../src/settings/apply-settings";
import { createInitialState, createRendererStore } from "../src/store/store";
import { createPerformanceSnapshot } from "./fixture";
import type { TreeProjection } from "./fixture";
import { createPerformanceController } from "./harness";
import type { PerformanceWindow } from "./types";
import "../src/styles.css";

async function start(): Promise<void> {
  const parameters = new URLSearchParams(window.location.search);
  const fixtureName = parameters.get("fixture") ?? "wide-1000";
  const blockCount = Number(parameters.get("blocks") ?? "50");
  if (![50, 500, 2000].includes(blockCount)) {
    throw new Error(`unsupported block count ${blockCount}`);
  }
  const response = await fetch(`../fixtures/${fixtureName}.json`);
  if (!response.ok) {
    throw new Error(`fixture ${fixtureName} failed with ${response.status}`);
  }
  const projection = (await response.json()) as TreeProjection;
  const { snapshot, identity, references } = createPerformanceSnapshot(projection, blockCount);
  const store = createRendererStore(createInitialState(snapshot, undefined, references));
  bindSettingsToRoot(store, document.documentElement);
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("missing root container");
  }
  let profilerCallback: ProfilerOnRenderCallback | null = null;
  const onRender: ProfilerOnRenderCallback = (...arguments_) => {
    profilerCallback?.(...arguments_);
  };
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      <StrictMode>
        <Profiler id="product-renderer" onRender={onRender}>
          <App store={store} />
        </Profiler>
      </StrictMode>,
    );
  });
  const controller = await createPerformanceController(store, identity);
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
