import type { Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { annotationRangesInDoc } from "./annotation-menu";

/**
 * Anchor status is workspace state, not document state: resolving a thread must
 * not write the note. So the mark carries only a thread id and every visible
 * difference between an open, resolved, and focused anchor is painted here from
 * state the editor pushes in.
 *
 * This is why `mark[data-skriuw-annotation]` has no tint of its own — a child
 * decoration cannot repaint the mark element wrapping it, so the plugin owns
 * the whole appearance rather than trying to subtract from a base rule.
 */
export type AnnotationDecorationInputs = {
  activeThreadId: string;
  resolvedThreadIds: ReadonlySet<string>;
};

type AnnotationDecorationState = AnnotationDecorationInputs & {
  decorations: DecorationSet;
};

export const annotationDecorationPluginKey = new PluginKey<AnnotationDecorationState>(
  "skriuw-annotation-decorations",
);

const OPEN_CLASS = "skriuw-annotation";
const RESOLVED_CLASS = "skriuw-annotation skriuw-annotation--resolved";
const ACTIVE_CLASS = "skriuw-annotation skriuw-annotation--active";

function buildDecorations(
  doc: ProseMirrorNode,
  inputs: AnnotationDecorationInputs,
): DecorationSet {
  const ranges = annotationRangesInDoc(doc);
  if (ranges.length === 0) return DecorationSet.empty;
  const decorations = ranges.map((range) => {
    const active = range.threadId === inputs.activeThreadId;
    const resolved = inputs.resolvedThreadIds.has(range.threadId);
    return Decoration.inline(range.from, range.to, {
      class: active ? ACTIVE_CLASS : resolved ? RESOLVED_CLASS : OPEN_CLASS,
    });
  });
  return DecorationSet.create(doc, decorations);
}

function sameInputs(
  left: AnnotationDecorationInputs,
  right: AnnotationDecorationInputs,
): boolean {
  if (left.activeThreadId !== right.activeThreadId) return false;
  if (left.resolvedThreadIds.size !== right.resolvedThreadIds.size) return false;
  for (const id of left.resolvedThreadIds) {
    if (!right.resolvedThreadIds.has(id)) return false;
  }
  return true;
}

export function createAnnotationDecorationPlugin(): Plugin<AnnotationDecorationState> {
  return new Plugin<AnnotationDecorationState>({
    key: annotationDecorationPluginKey,
    state: {
      init() {
        return {
          activeThreadId: "",
          resolvedThreadIds: new Set<string>(),
          decorations: DecorationSet.empty,
        };
      },
      apply(tr, previous, _oldState, newState) {
        const meta = tr.getMeta(annotationDecorationPluginKey) as
          | AnnotationDecorationInputs
          | undefined;
        if (meta) {
          const next = { ...previous, ...meta };
          return { ...next, decorations: buildDecorations(newState.doc, next) };
        }
        /**
         * Ranges are rebuilt rather than mapped through `tr.mapping`, because a
         * transaction can add or remove an anchor without saying so — undo
         * restores a deleted mark, and a paste can carry anchors in. Mapping
         * alone would leave those unpainted until the next explicit push.
         */
        if (tr.docChanged) {
          return { ...previous, decorations: buildDecorations(newState.doc, previous) };
        }
        return previous;
      },
    },
    props: {
      decorations(state) {
        return annotationDecorationPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

export type AnnotationDecorationTarget = {
  readonly state: EditorState;
  dispatch(transaction: Transaction): void;
};

/**
 * Pushes anchor appearance into the editor. Never adds to history: the visible
 * state of a thread is not an edit, and undo must not step through it.
 */
export function setAnnotationDecorations(
  view: AnnotationDecorationTarget,
  inputs: AnnotationDecorationInputs,
): void {
  const current = annotationDecorationPluginKey.getState(view.state);
  if (current && sameInputs(current, inputs)) return;
  const tr = view.state.tr.setMeta(annotationDecorationPluginKey, inputs);
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}

export function resolvedThreadIdsForNote(
  annotations: ReadonlyMap<string, { noteId: string; status: string }>,
  noteId: string | null,
): ReadonlySet<string> {
  const resolved = new Set<string>();
  if (noteId === null) return resolved;
  for (const [id, annotation] of annotations) {
    if (annotation.noteId === noteId && annotation.status === "resolved") {
      resolved.add(id);
    }
  }
  return resolved;
}
