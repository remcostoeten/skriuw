import { Suspense, use, type ComponentProps } from "react";
import type { RawMarkdownEditor as RawMarkdownEditorComponent } from "./raw-markdown-editor";

type Editor = typeof RawMarkdownEditorComponent;
type Props = ComponentProps<Editor>;

let loadedEditor: Editor | null = null;
let loadingEditor: Promise<Editor> | null = null;

/**
 * @name loadRawMarkdownEditor
 * @description Loads the raw Markdown editor and its CodeMirror and vim code,
 * which live outside the startup bundle. Startup loads it before the first
 * render when the first screen shows a raw note, and right after the first
 * commit otherwise. A failed load is retried on the next call.
 *
 * @example
 * const RawMarkdownEditor = await loadRawMarkdownEditor();
 */
export function loadRawMarkdownEditor(): Promise<Editor> {
  loadingEditor ??= import("./raw-markdown-editor").then(
    (module) => {
      loadedEditor = module.RawMarkdownEditor;
      return module.RawMarkdownEditor;
    },
    (error: Error) => {
      loadingEditor = null;
      throw error;
    },
  );
  return loadingEditor;
}

/**
 * @name preloadRawMarkdownEditor
 * @description Starts loading the raw Markdown editor without rendering it,
 * so the first raw note after startup renders without waiting on a chunk.
 * Resolves once the load settles; a failure is logged, not thrown.
 *
 * @example
 * await preloadRawMarkdownEditor();
 */
export function preloadRawMarkdownEditor(): Promise<void> {
  return loadRawMarkdownEditor().then(
    () => undefined,
    (error: Error) => {
      console.error("raw Markdown editor preload failed", error);
    },
  );
}

function PendingRawMarkdownEditor(props: Props) {
  const Loaded = use(loadRawMarkdownEditor());
  return <Loaded {...props} />;
}

export function LazyRawMarkdownEditor(props: Props) {
  if (loadedEditor) {
    const Loaded = loadedEditor;
    return <Loaded {...props} />;
  }
  return (
    <Suspense fallback={null}>
      <PendingRawMarkdownEditor {...props} />
    </Suspense>
  );
}
