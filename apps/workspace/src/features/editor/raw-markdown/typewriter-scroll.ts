import type { Transaction as SourceTransaction } from "@codemirror/state";
import { ViewPlugin, type EditorView as SourceView, type ViewUpdate } from "@codemirror/view";
import {
  measureTypewriterScroll,
  sourceUpdateMovesCaret,
  typewriterScrollBehavior,
} from "../focus/typewriter-scroll";

const SOURCE_MEASURE_KEY = { typewriter: true };

function sourceScrollContainer(view: SourceView): HTMLElement {
  return view.dom.closest<HTMLElement>(".editor-scroll") ?? view.scrollDOM;
}

/**
 * @name sourceTypewriterScrolling
 * @description CodeMirror extension for typewriter scrolling in raw Markdown
 * mode. It measures through CodeMirror's own measure cycle, so the caret read
 * and the scroll write join the editor's layout pass instead of forcing one.
 *
 * @example
 * sourceTypewriterScrolling(
 *   () => usesTypewriterScrolling(store.getState().settings),
 *   (tr) => tr.annotation(externalChange) === true,
 * );
 */
export function sourceTypewriterScrolling(
  enabled: () => boolean,
  isExternal: (transaction: SourceTransaction) => boolean,
) {
  return ViewPlugin.define(() => ({
    update: (update: ViewUpdate) => {
      if (!sourceUpdateMovesCaret(update, isExternal) || !update.view.hasFocus || !enabled()) {
        return;
      }
      update.view.requestMeasure({
        key: SOURCE_MEASURE_KEY,
        read: (view) => {
          const container = sourceScrollContainer(view);
          const caret = view.coordsAtPos(view.state.selection.main.head);
          return {
            container,
            top: caret === null ? null : measureTypewriterScroll(container, caret),
          };
        },
        write: ({ container, top }) => {
          if (top !== null) {
            container.scrollTo({ top, behavior: typewriterScrollBehavior() });
          }
        },
      });
    },
  }));
}
