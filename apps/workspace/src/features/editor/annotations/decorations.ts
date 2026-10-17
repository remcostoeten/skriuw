import type { MarkType, Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { AddMarkStep, RemoveMarkStep } from "prosemirror-transform";
import { Decoration, DecorationSet } from "prosemirror-view";
import { annotationRangesInDoc } from "./menu";

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

function buildDecorations(doc: ProseMirrorNode, inputs: AnnotationDecorationInputs): DecorationSet {
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

function carriesAnnotation(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  annotation: MarkType,
): boolean {
  const size = doc.content.size;
  let found = false;
  doc.nodesBetween(Math.max(0, from - 1), Math.min(size, to + 1), (node) => {
    if (found) return false;
    if (node.isText && annotation.isInSet(node.marks)) found = true;
    return !found;
  });
  return found;
}

function touchesAnnotations(tr: Transaction, annotation: MarkType): boolean {
  return tr.steps.some((step, index) => {
    if (
      (step instanceof AddMarkStep || step instanceof RemoveMarkStep) &&
      step.mark.type === annotation
    ) {
      return true;
    }
    const before = tr.docs[index];
    const after = tr.docs[index + 1] ?? tr.doc;
    if (!before) return true;
    let touched = false;
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (touched) return;
      touched =
        carriesAnnotation(before, oldStart, oldEnd, annotation) ||
        carriesAnnotation(after, newStart, newEnd, annotation);
    });
    return touched;
  });
}

function sameInputs(left: AnnotationDecorationInputs, right: AnnotationDecorationInputs): boolean {
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
        if (!tr.docChanged) return previous;
        /**
         * Ranges are rebuilt whenever a step replaces text next to an anchor or
         * adds or removes an anchor mark, because undo can restore a deleted mark
         * and a paste can carry anchors in. Every other edit only maps them.
         */
        const annotation = newState.schema.marks.annotation;
        if (annotation && touchesAnnotations(tr, annotation)) {
          return { ...previous, decorations: buildDecorations(newState.doc, previous) };
        }
        const decorations = previous.decorations.map(tr.mapping, tr.doc);
        if (decorations === previous.decorations) return previous;
        return { ...previous, decorations };
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
