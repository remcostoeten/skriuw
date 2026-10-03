import type { Transaction as SourceTransaction } from "@codemirror/state";
import { ViewPlugin, type EditorView as SourceView, type ViewUpdate } from "@codemirror/view";
import { Plugin, PluginKey, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { REMOTE_APPLY_META } from "../document/remote-merge";

export type TypewriterGeometry = {
  caretTop: number;
  caretBottom: number;
  containerTop: number;
  containerHeight: number;
  scrollTop: number;
  scrollHeight: number;
};

export type TypewriterHost = {
  enabled: () => boolean;
  scrollContainer: () => HTMLElement | null;
};

type TypewriterMark = { readonly requested: boolean };

const IDLE: TypewriterMark = { requested: false };

const SETTLED_DISTANCE = 2;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const typewriterKey = new PluginKey<TypewriterMark>("typewriter-scroll");

const SOURCE_MEASURE_KEY = { typewriter: true };

/**
 * @name typewriterScrollTop
 * @description The scroll offset that puts the caret line in the vertical
 * middle of its scroll container, clamped to the scrollable range. Null when
 * the caret already sits within a couple of pixels of the middle, so typing
 * along a line never writes to the scroll position.
 *
 * @example
 * const top = typewriterScrollTop(geometry);
 * if (top !== null) container.scrollTo({ top });
 */
export function typewriterScrollTop(geometry: TypewriterGeometry): number | null {
  const caretMiddle = (geometry.caretTop + geometry.caretBottom) / 2;
  const containerMiddle = geometry.containerTop + geometry.containerHeight / 2;
  const delta = caretMiddle - containerMiddle;
  if (Math.abs(delta) < SETTLED_DISTANCE) {
    return null;
  }
  const maxScrollTop = Math.max(0, geometry.scrollHeight - geometry.containerHeight);
  const next = Math.round(Math.min(maxScrollTop, Math.max(0, geometry.scrollTop + delta)));
  return Math.abs(next - geometry.scrollTop) < 1 ? null : next;
}

/**
 * @name transactionMovesCaret
 * @description Whether a rendered-editor transaction is the writer moving the
 * caret: an edit or a selection change that did not come from a pointer and
 * was not a remote merge.
 *
 * @example
 * if (transactionMovesCaret(tr)) requestCentering();
 */
export function transactionMovesCaret(tr: Transaction): boolean {
  return (
    (tr.docChanged || tr.selectionSet) &&
    tr.getMeta("pointer") !== true &&
    tr.getMeta(REMOTE_APPLY_META) !== true
  );
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? "instant" : "smooth";
}

function measure(container: HTMLElement, caret: { top: number; bottom: number }): number | null {
  const rect = container.getBoundingClientRect();
  return typewriterScrollTop({
    caretTop: caret.top,
    caretBottom: caret.bottom,
    containerTop: rect.top,
    containerHeight: container.clientHeight,
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
  });
}

function centerCaret(view: EditorView, container: HTMLElement | null): void {
  if (container === null || view.isDestroyed) {
    return;
  }
  const top = measure(container, view.coordsAtPos(view.state.selection.head));
  if (top !== null) {
    container.scrollTo({ top, behavior: scrollBehavior() });
  }
}

/**
 * @name createTypewriterPlugin
 * @description Keeps the rendered editor's caret line vertically centred
 * while typing. Qualifying transactions only set a mark; the plugin view
 * coalesces them into one read and one scroll write per animation frame, so a
 * burst of keystrokes never interleaves layout reads with writes.
 *
 * @example
 * const plugin = createTypewriterPlugin({
 *   enabled: () => usesTypewriterScrolling(store.getState().settings),
 *   scrollContainer: () => scrollHostRef.current,
 * });
 */
export function createTypewriterPlugin(host: TypewriterHost): Plugin<TypewriterMark> {
  return new Plugin<TypewriterMark>({
    key: typewriterKey,
    state: {
      init: () => IDLE,
      apply: (tr, value) => (transactionMovesCaret(tr) ? { requested: true } : value),
    },
    view: () => {
      let frame = 0;
      return {
        update: (view, previous) => {
          const mark = typewriterKey.getState(view.state);
          if (
            frame !== 0 ||
            mark === undefined ||
            mark === IDLE ||
            mark === typewriterKey.getState(previous) ||
            view.composing ||
            !view.hasFocus() ||
            !host.enabled()
          ) {
            return;
          }
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            centerCaret(view, host.scrollContainer());
          });
        },
        destroy: () => {
          if (frame !== 0) {
            window.cancelAnimationFrame(frame);
          }
        },
      };
    },
  });
}

function sourceScrollContainer(view: SourceView): HTMLElement {
  return view.dom.closest<HTMLElement>(".editor-scroll") ?? view.scrollDOM;
}

/**
 * @name sourceUpdateMovesCaret
 * @description The raw Markdown counterpart of `transactionMovesCaret`:
 * an edit or selection change that neither a pointer nor a programmatic
 * document swap produced.
 *
 * @example
 * sourceUpdateMovesCaret(update, (tr) => tr.annotation(externalChange) === true);
 */
export function sourceUpdateMovesCaret(
  update: Pick<ViewUpdate, "docChanged" | "selectionSet" | "transactions">,
  isExternal: (transaction: SourceTransaction) => boolean,
): boolean {
  return (
    (update.docChanged || update.selectionSet) &&
    update.transactions.every(
      (transaction) => !transaction.isUserEvent("select.pointer") && !isExternal(transaction),
    )
  );
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
          return { container, top: caret === null ? null : measure(container, caret) };
        },
        write: ({ container, top }) => {
          if (top !== null) {
            container.scrollTo({ top, behavior: scrollBehavior() });
          }
        },
      });
    },
  }));
}
