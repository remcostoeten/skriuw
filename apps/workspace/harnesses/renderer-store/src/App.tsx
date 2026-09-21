import { Profiler, useRef } from "react";
import { EditorHost } from "./EditorHost";
import { recordProfilerCommit, recordRender } from "./ledger";
import { MetadataPanel } from "./MetadataPanel";
import { SettingsConsumer } from "./SettingsConsumer";
import { TreeHost } from "./TreeHost";
import type { RendererStore, TreeProjection } from "./types";

type Props = {
  projection: TreeProjection;
  store: RendererStore;
};

const fixtureNames = ["nested-1000", "nested-5000", "wide-5000", "mixed-5000"];

export function App({ projection, store }: Props) {
  recordRender("ApplicationShell");
  const resultRef = useRef<HTMLPreElement>(null);
  const onFixtureChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const url = new URL(window.location.href);
    url.searchParams.set("fixture", event.target.value);
    window.location.assign(url);
  };
  const onRun = async () => {
    if (!resultRef.current) {
      return;
    }
    resultRef.current.textContent = "Running selector and render scenarios…";
    const benchmarkWindow = window as unknown as Window & {
      __SKRIUW_RENDERER_STORE__: { run: () => Promise<unknown> };
    };
    const result = await benchmarkWindow.__SKRIUW_RENDERER_STORE__.run();
    resultRef.current.textContent = JSON.stringify(result, null, 2);
  };
  return (
    <Profiler id="renderer-store" onRender={recordProfilerCommit}>
      <main className="application-shell">
        <header className="titlebar">
          <div className="brand-block">
            <span className="brand-mark">SK</span>
            <div>
              <strong>Skriuw selector laboratory</strong>
              <span>React renderer isolation / {__PROFILE_BUILD__ ? "profiling" : "production"}</span>
            </div>
          </div>
          <div className="fixture-controls">
            <label htmlFor="fixture">Fixture</label>
            <select id="fixture" onChange={onFixtureChange} value={projection.metadata.name}>
              {fixtureNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button className="run-button" onClick={onRun} type="button">
              Run benchmark
            </button>
          </div>
        </header>
        <section className="workspace-grid">
          <aside className="sidebar">
            <div className="pane-heading">
              <div>
                <span>Workspace tree</span>
                <strong>{projection.metadata.nodeCount.toLocaleString()} nodes</strong>
              </div>
              <span className="digest" title={projection.operationsDigest}>
                {projection.operationsDigest.slice(0, 8)}
              </span>
            </div>
            <TreeHost store={store} />
            <footer>
              <Profiler id="SettingsConsumer" onRender={recordProfilerCommit}>
                <SettingsConsumer store={store} />
              </Profiler>
              <span>{projection.metadata.maxDepth} levels</span>
            </footer>
          </aside>
          <section className="document-pane">
            <EditorHost store={store} />
          </section>
          <MetadataPanel store={store} />
        </section>
        <section className="render-ledger">
          <header>
            <div>
              <span>Render ledger</span>
              <strong>Isolation evidence, not application state</strong>
            </div>
            <div className="state-strip" aria-label="State gallery">
              <span>empty</span>
              <span className="is-error">error</span>
              <span className="is-disabled">disabled</span>
              <span>reduced motion</span>
              <span className="ledger-key">P95 &lt; 8 ms / max &lt; 16.67 ms</span>
            </div>
          </header>
          <pre ref={resultRef}>Run the benchmark to inspect raw timings, notifications, commits, and render invocations.</pre>
        </section>
      </main>
    </Profiler>
  );
}
