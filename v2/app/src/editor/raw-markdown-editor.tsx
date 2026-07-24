import { useEffect, useMemo, useRef, useState } from "react";
import { commitOperations } from "../actions/workspace";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { DocumentRecord, RendererState, RendererStore } from "../store/types";
import { countWords, parseProductMarkdownWithImages } from "./schema";

const SAVE_DEBOUNCE_MS = 500;

type Props = {
  store: RendererStore;
  selectNoteId: (state: RendererState) => string | null;
};

export function RawMarkdownEditor({ store, selectNoteId }: Props) {
  const activeNoteId = useRendererSelector(store, selectNoteId);
  const selectRecord = useMemo(
    () =>
      (state: RendererState): DocumentRecord | undefined => {
        const noteId = selectNoteId(state);
        return noteId ? state.documents.get(noteId) : undefined;
      },
    [selectNoteId],
  );
  const record = useRendererSelector(store, selectRecord);
  const [text, setText] = useState(record?.markdown ?? "");
  const noteIdRef = useRef(activeNoteId);
  const saveTimerRef = useRef<number | null>(null);
  const textRef = useRef(text);
  textRef.current = text;

  function saveNow(noteId: string, markdown: string): void {
    const current = store.getState().documents.get(noteId);
    if (!current) {
      return;
    }
    const knownImageIds = new Set(
      [...store.getState().images.values()]
        .filter((image) => image.noteId === noteId)
        .map((image) => image.id),
    );
    const document = parseProductMarkdownWithImages(markdown, knownImageIds);
    void commitOperations(store, [
      {
        type: "save_document",
        noteId,
        documentJson: document.toJSON(),
        markdown,
        wordCount: countWords(document),
        expectedRevision: current.revision,
        at: Date.now(),
      },
    ]).catch((error) => {
      console.error("save rejected", error);
    });
  }

  function flushPendingSave(noteId: string | null): void {
    if (saveTimerRef.current === null || noteId === null) {
      return;
    }
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    saveNow(noteId, textRef.current);
  }

  useEffect(() => {
    return () => flushPendingSave(noteIdRef.current);
  }, []);

  useEffect(() => {
    flushPendingSave(noteIdRef.current);
    noteIdRef.current = activeNoteId;
    setText(record?.markdown ?? "");
  }, [activeNoteId]);

  function handleChange(value: string): void {
    setText(value);
    const noteId = noteIdRef.current;
    if (noteId === null) {
      return;
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveNow(noteId, textRef.current);
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <textarea
      className="raw-markdown-editor"
      aria-label="Raw Markdown source"
      value={text}
      spellCheck={false}
      onChange={(event) => handleChange(event.currentTarget.value)}
    />
  );
}
