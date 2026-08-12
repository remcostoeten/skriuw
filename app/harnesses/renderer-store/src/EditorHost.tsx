import { Profiler, useEffect, useMemo, useRef } from "react";
import { recordMount, recordProfilerCommit, recordRender } from "./ledger";
import { useRendererSelector } from "./useRendererSelector";
import type { RendererStore } from "./types";

type Props = {
  store: RendererStore;
};

const selectPreparedDocument = (state: ReturnType<RendererStore["getState"]>) =>
  state.activeNoteId ? state.documents.get(state.activeNoteId) ?? null : null;

function EditorSelectionConsumer({ store }: Props) {
  recordRender("EditorSelectionConsumer");
  const document = useRendererSelector(store, selectPreparedDocument);
  return (
    <div className="prepared-document" data-prepared-document={document?.preparedIdentity ?? "empty"}>
      <span className="document-kicker">Prepared document</span>
      <strong>{document?.preparedIdentity ?? "No note selected"}</strong>
    </div>
  );
}

export function EditorHost({ store }: Props) {
  recordRender("EditorHost");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const sentinelId = useMemo(() => `editor-host-${crypto.randomUUID()}`, []);
  useEffect(() => recordMount("EditorHost"), []);
  const onInput = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.dataset["ownedUpdates"] = String(Number(editor.dataset["ownedUpdates"] ?? 0) + 1);
  };
  return (
    <section className="editor-host" data-editor-host={sentinelId}>
      <Profiler id="EditorSelectionConsumer" onRender={recordProfilerCommit}>
        <EditorSelectionConsumer store={store} />
      </Profiler>
      <textarea
        aria-label="Editor-owned typing surface"
        data-owned-updates="0"
        defaultValue="The renderer store never sees these keystrokes. This surface stands in for editor-owned state and transient selection."
        onInput={onInput}
        ref={editorRef}
        spellCheck={false}
      />
    </section>
  );
}
