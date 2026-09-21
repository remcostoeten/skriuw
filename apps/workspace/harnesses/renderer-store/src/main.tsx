import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installBenchmark } from "./benchmark";
import { createInitialState, createRendererStore } from "./store";
import "./styles.css";
import type { TreeProjection } from "./types";

async function start(): Promise<void> {
  const fixture = new URLSearchParams(window.location.search).get("fixture") ?? "nested-5000";
  const response = await fetch(`./fixtures/${fixture}.json`);
  if (!response.ok) {
    throw new Error(`fixture ${fixture} failed with ${response.status}`);
  }
  const projection = (await response.json()) as TreeProjection;
  const store = createRendererStore(createInitialState(projection));
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("missing root element");
  }
  createRoot(root).render(<App projection={projection} store={store} />);
  requestAnimationFrame(() => installBenchmark(store, projection));
}

void start().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `<main class="startup-error"><strong>Workspace unavailable</strong><span>${String(error)}</span><button type="button" onclick="location.reload()">Try again</button></main>`;
  }
});
