import type { Transaction as SourceTransaction } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
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

/**
 * @name typewriterScrollBehavior
 * @description Smooth scrolling for typewriter centring, instant when the
 * writer asked the system for reduced motion.
 *
 * @example
 * container.scrollTo({ top, behavior: typewriterScrollBehavior() });
 */
export function typewriterScrollBehavior(): ScrollBehavior {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? "instant" : "smooth";
}

/**
 * @name measureTypewriterScroll
 * @description Reads the container's geometry and returns the scroll offset
 * that centres the given caret box, or null when it is already centred.
 *
 * @example
 * const top = measureTypewriterScroll(container, view.coordsAtPos(head));
 */
export function measureTypewriterScroll(
  container: HTMLElement,
  caret: { top: number; bottom: number },
): number | null {
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
  const top = measureTypewriterScroll(container, view.coordsAtPos(view.state.selection.head));
  if (top !== null) {
    container.scrollTo({ top, behavior: typewriterScrollBehavior() });
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
