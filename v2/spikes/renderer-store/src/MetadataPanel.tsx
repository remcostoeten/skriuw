import { Profiler } from "react";
import { recordRender } from "./ledger";
import { recordProfilerCommit } from "./ledger";
import { MetadataTitle } from "./MetadataTitle";
import { MetadataUpdatedAt } from "./MetadataUpdatedAt";
import { MetadataWordCount } from "./MetadataWordCount";
import type { RendererStore } from "./types";

type Props = {
  store: RendererStore;
};

export function MetadataPanel({ store }: Props) {
  recordRender("MetadataPanel");
  return (
    <aside className="metadata-panel">
      <header>
        <span>Note ledger</span>
        <span className="status-dot">local</span>
      </header>
      <dl>
        <div>
          <dt>Title</dt>
          <Profiler id="MetadataTitle" onRender={recordProfilerCommit}>
            <MetadataTitle store={store} />
          </Profiler>
        </div>
        <div>
          <dt>Words</dt>
          <Profiler id="MetadataWordCount" onRender={recordProfilerCommit}>
            <MetadataWordCount store={store} />
          </Profiler>
        </div>
        <div>
          <dt>Updated</dt>
          <Profiler id="MetadataUpdatedAt" onRender={recordProfilerCommit}>
            <MetadataUpdatedAt store={store} />
          </Profiler>
        </div>
      </dl>
    </aside>
  );
}
