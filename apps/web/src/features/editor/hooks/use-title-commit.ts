import { useEffect } from "react";
import {
  type EditorInstance,
} from "@/features/editor/lib/editor-instance";
import { getFirstHeadingTitle } from "@/features/editor/lib/editor-serialization";

type Params = {
  editor: EditorInstance;
  editorDom: HTMLElement | null;
  onTitleCommit?: (title: string) => void;
};

export function useTitleCommit({ editor, editorDom, onTitleCommit }: Params) {
  useEffect(() => {
    if (!onTitleCommit) return;

    const domElement = editorDom;
    if (!domElement) return;

    const isFirstHeadingElement = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const heading = target.closest('[data-content-type="heading"]');
      if (!heading || !domElement.contains(heading)) {
        return false;
      }

      return (
        heading === domElement.querySelector('[data-content-type="heading"]')
      );
    };

    const handleTitleFocusOut = (event: FocusEvent) => {
      if (!isFirstHeadingElement(event.target)) {
        return;
      }

      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && domElement.contains(relatedTarget)) {
        const nextHeading =
          relatedTarget instanceof HTMLElement
            ? relatedTarget.closest('[data-content-type="heading"]')
            : null;
        if (
          nextHeading &&
          nextHeading ===
            domElement.querySelector('[data-content-type="heading"]')
        ) {
          return;
        }
      }

      const title = getFirstHeadingTitle(editor);
      if (title) {
        onTitleCommit(title);
      }
    };

    domElement.addEventListener("focusout", handleTitleFocusOut);
    return () =>
      domElement.removeEventListener("focusout", handleTitleFocusOut);
  }, [editor, editorDom, onTitleCommit]);

  // Commit the title the moment the caret leaves the first heading block —
  // pressing Enter, Tab, or navigating into another block. `focusout` above only
  // fires when focus leaves the editor entirely, so without this the filename
  // wouldn't follow the heading until the editor blurred. Caret moves between
  // blocks don't blur the (single) contenteditable, so we watch the selection.
  useEffect(() => {
    if (!onTitleCommit) return;
    const domElement = editorDom;
    if (!domElement) return;

    let wasInFirstHeading = false;

    const getFirstHeadingBlockId = (): string | null => {
      const first = editor.document?.find(
        (block: { type?: unknown }) => block?.type === "heading",
      );
      return (first as { id?: string } | undefined)?.id ?? null;
    };

    const checkHeadingExit = () => {
      const firstHeadingId = getFirstHeadingBlockId();
      let currentBlockId: string | null = null;
      try {
        currentBlockId = editor.getTextCursorPosition?.().block?.id ?? null;
      } catch {
        currentBlockId = null;
      }
      const inFirstHeading =
        firstHeadingId !== null && currentBlockId === firstHeadingId;
      if (wasInFirstHeading && !inFirstHeading) {
        const title = getFirstHeadingTitle(editor);
        if (title) {
          onTitleCommit(title);
        }
      }
      wasInFirstHeading = inFirstHeading;
    };

    let pendingFrame: number | null = null;
    const handler = () => {
      if (pendingFrame !== null) {
        window.cancelAnimationFrame(pendingFrame);
      }
      pendingFrame = window.requestAnimationFrame(() => {
        checkHeadingExit();
        pendingFrame = null;
      });
    };

    document.addEventListener("selectionchange", handler);
    pendingFrame = window.requestAnimationFrame(() => {
      checkHeadingExit();
      pendingFrame = null;
    });
    return () => {
      document.removeEventListener("selectionchange", handler);
      if (pendingFrame !== null) {
        window.cancelAnimationFrame(pendingFrame);
      }
    };
  }, [editor, editorDom, onTitleCommit]);
}
