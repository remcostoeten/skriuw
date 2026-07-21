import { Sidebar } from "./shell/Sidebar";
import { EditorHost } from "./shell/EditorHost";
import { MetadataPanel } from "./shell/MetadataPanel";
import type { RendererStore } from "./store/types";

type Props = {
  store: RendererStore;
};

export function App({ store }: Props) {
  return (
    <div className="shell">
      <nav className="icon-rail" aria-label="Primary">
        <button type="button" className="icon-rail-button is-active" aria-label="Notes">
          N
        </button>
        <button type="button" className="icon-rail-button" aria-label="Search" disabled>
          S
        </button>
        <button type="button" className="icon-rail-button" aria-label="Settings" disabled>
          ⚙
        </button>
      </nav>
      <Sidebar store={store} />
      <main className="editor-pane">
        <EditorHost store={store} />
      </main>
      <MetadataPanel store={store} />
    </div>
  );
}
