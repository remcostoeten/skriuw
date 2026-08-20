import type { WorkspaceAnnotation } from "@/contracts/workspace";
import { showToast } from "@/shared/ui/toast";
import type { RendererStore } from "@/store/types";
import { commitOperations } from "./workspace";

function reportRejection(action: string) {
  return (error: unknown) => {
    console.error(`${action} rejected`, error);
  };
}

export function createAnnotation(
  store: RendererStore,
  annotation: WorkspaceAnnotation,
): void {
  void commitOperations(store, [{ type: "create_annotation", annotation }]).catch(
    reportRejection("create annotation"),
  );
}

export function addAnnotationComment(
  store: RendererStore,
  annotationId: string,
  bodyMarkdown: string,
  at: number,
): void {
  void commitOperations(store, [
    {
      type: "add_annotation_comment",
      annotationId,
      comment: {
        id: crypto.randomUUID(),
        bodyMarkdown,
        authorId: null,
        createdAt: at,
        updatedAt: at,
      },
    },
  ]).catch(reportRejection("add annotation comment"));
}

export function updateAnnotationComment(
  store: RendererStore,
  annotationId: string,
  commentId: string,
  bodyMarkdown: string,
  at: number,
): void {
  void commitOperations(store, [
    {
      type: "update_annotation_comment",
      annotationId,
      commentId,
      bodyMarkdown,
      updatedAt: at,
    },
  ]).catch(reportRejection("update annotation comment"));
}

export function deleteAnnotationComment(
  store: RendererStore,
  annotationId: string,
  commentId: string,
): void {
  void commitOperations(store, [
    { type: "delete_annotation_comment", annotationId, commentId },
  ]).catch(reportRejection("delete annotation comment"));
}

export function setAnnotationResolved(
  store: RendererStore,
  annotationId: string,
  resolved: boolean,
  at: number,
): void {
  void commitOperations(store, [
    resolved
      ? { type: "resolve_annotation", id: annotationId, at }
      : { type: "reopen_annotation", id: annotationId },
  ]).catch(reportRejection("resolve annotation"));
}

/**
 * Deleting a thread offers the whole record back as undo, the way prompt and
 * sidebar deletes do. Recreating it replays the comments that came with it,
 * so an undo restores the conversation rather than an empty anchor.
 */
export function deleteAnnotation(
  store: RendererStore,
  annotation: WorkspaceAnnotation,
): void {
  void commitOperations(store, [{ type: "delete_annotation", id: annotation.id }]).catch(
    reportRejection("delete annotation"),
  );
  showToast({
    message: "Deleted comment thread",
    action: {
      label: "Undo",
      run: () => {
        /* A thread is always created open, so a resolved one is restored by
           the create its resolve rode in on. */
        createAnnotation(store, {
          ...annotation,
          status: "open",
          resolvedAt: null,
        });
        if (annotation.status === "resolved") {
          setAnnotationResolved(
            store,
            annotation.id,
            true,
            annotation.resolvedAt ?? Date.now(),
          );
        }
      },
    },
  });
}
