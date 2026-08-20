import { useEffect, useRef, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { AnnotationComment, WorkspaceAnnotation } from "@/contracts/workspace";
import { CheckIcon, PencilIcon, Trash2Icon } from "@/shared/icons/static";
import { rangeMenuAnchor, type MenuAnchor } from "./menu-anchor";
import { productSchema } from "./schema";

export type AnnotationMenuState = {
  open: boolean;
  composing: boolean;
  threadId: string;
  from: number;
  to: number;
  x: number;
  y: number;
  below: boolean;
};

export const closedAnnotationMenu: AnnotationMenuState = {
  open: false,
  composing: false,
  threadId: "",
  from: 0,
  to: 0,
  x: 0,
  y: 0,
  below: false,
};

const ANNOTATION_MENU_WIDTH = 320;

export type AnnotationRange = {
  threadId: string;
  from: number;
  to: number;
};

/**
 * Every anchored range in the document, keyed by thread. A thread can be
 * split across text nodes by other marks, so adjacent runs carrying the same
 * id are merged back into one range.
 */
export function annotationRanges(state: EditorState): AnnotationRange[] {
  const annotation = productSchema.marks.annotation;
  if (!annotation) return [];
  /**
   * Threads are allowed to overlap, so a text node can carry several anchor
   * marks at once. `isInSet` would only ever surface the first, hiding every
   * thread nested inside another — each mark on the node has to be walked.
   */
  const runsByThread = new Map<string, AnnotationRange[]>();
  state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type !== annotation) continue;
      const threadId = String(mark.attrs.threadId ?? "");
      const runs = runsByThread.get(threadId) ?? [];
      const last = runs[runs.length - 1];
      if (last && last.to === pos) {
        last.to = pos + node.nodeSize;
      } else {
        runs.push({ threadId, from: pos, to: pos + node.nodeSize });
      }
      runsByThread.set(threadId, runs);
    }
    return true;
  });
  return [...runsByThread.values()]
    .flat()
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

/** The innermost anchor containing a collapsed caret, or null. */
export function annotationAtCursor(state: EditorState): AnnotationRange | null {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const cursor = $from.pos;
  const containing = annotationRanges(state).filter(
    (range) => cursor > range.from && cursor < range.to,
  );
  return containing.reduce<AnnotationRange | null>(
    (innermost, range) =>
      !innermost || range.to - range.from < innermost.to - innermost.from ? range : innermost,
    null,
  );
}

export function annotationMenuAnchor(
  view: EditorView,
  from: number,
  to: number,
): MenuAnchor {
  return rangeMenuAnchor(view, from, to, ANNOTATION_MENU_WIDTH);
}

function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type Props = {
  state: AnnotationMenuState;
  thread: WorkspaceAnnotation | null;
  getView: () => EditorView | null;
  onCreate: (body: string) => void;
  onReply: (body: string) => void;
  onEditComment: (commentId: string, body: string) => void;
  onDeleteComment: (commentId: string) => void;
  onResolve: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function AnnotationMenu({
  state,
  thread,
  getView,
  onCreate,
  onReply,
  onEditComment,
  onDeleteComment,
  onResolve,
  onReopen,
  onDelete,
  onClose,
}: Props) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!state.open) return;
    setDraft("");
    setEditingId(null);
    inputRef.current?.focus();
  }, [state.open, state.composing, state.threadId]);

  if (!state.open) return null;

  function closeAndFocus(): void {
    onClose();
    getView()?.focus();
  }

  function submitDraft(): void {
    const body = draft.trim();
    if (!body) return;
    if (state.composing) onCreate(body);
    else onReply(body);
    setDraft("");
    if (state.composing) closeAndFocus();
  }

  function submitEdit(): void {
    const body = editDraft.trim();
    if (!body || !editingId) return;
    onEditComment(editingId, body);
    setEditingId(null);
  }

  const now = Date.now();
  const resolved = thread?.status === "resolved";

  return (
    <div
      className="annotation-menu"
      id={state.threadId ? `skriuw-annotation-${state.threadId}` : undefined}
      data-below={state.below ? "true" : undefined}
      style={{ left: state.x, top: state.y }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeAndFocus();
        }
      }}
    >
      {thread ? (
        <div className="annotation-menu-thread">
          {thread.comments.length === 0 ? (
            <p className="annotation-menu-empty">
              Every comment here was deleted. The thread stays until you delete it.
            </p>
          ) : (
            <ul className="annotation-menu-comments">
              {thread.comments.map((comment: AnnotationComment) => (
                <li key={comment.id} className="annotation-menu-comment">
                  {editingId === comment.id ? (
                    <div className="annotation-menu-edit">
                      <textarea
                        className="annotation-menu-input"
                        aria-label="Edit comment"
                        value={editDraft}
                        rows={2}
                        onChange={(event) => setEditDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            submitEdit();
                          }
                        }}
                      />
                      <button
                        type="button"
                        title="Save comment"
                        aria-label="Save comment"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          submitEdit();
                        }}
                      >
                        <CheckIcon size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="annotation-menu-body">{comment.bodyMarkdown}</p>
                      <div className="annotation-menu-meta">
                        <span>{relativeTime(comment.createdAt, now)}</span>
                        <button
                          type="button"
                          title="Edit comment"
                          aria-label="Edit comment"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setEditingId(comment.id);
                            setEditDraft(comment.bodyMarkdown);
                          }}
                        >
                          <PencilIcon size={12} />
                        </button>
                        <button
                          type="button"
                          className="annotation-menu-destructive"
                          title="Delete comment"
                          aria-label="Delete comment"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            onDeleteComment(comment.id);
                          }}
                        >
                          <Trash2Icon size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="annotation-menu-actions">
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                if (resolved) onReopen();
                else onResolve();
              }}
            >
              {resolved ? "Reopen" : "Resolve"}
            </button>
            <button
              type="button"
              className="annotation-menu-destructive"
              onMouseDown={(event) => {
                event.preventDefault();
                onDelete();
                closeAndFocus();
              }}
            >
              Delete thread
            </button>
          </div>
        </div>
      ) : null}
      <div className="annotation-menu-composer">
        <textarea
          ref={inputRef}
          className="annotation-menu-input"
          rows={2}
          placeholder={state.composing ? "Add a comment" : "Reply"}
          aria-label={state.composing ? "New comment" : "Reply to thread"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitDraft();
            }
          }}
        />
        <button
          type="button"
          className="annotation-menu-submit"
          title={state.composing ? "Add comment" : "Reply"}
          aria-label={state.composing ? "Add comment" : "Reply"}
          disabled={!draft.trim()}
          onMouseDown={(event) => {
            event.preventDefault();
            submitDraft();
          }}
        >
          <CheckIcon size={13} />
        </button>
      </div>
    </div>
  );
}
