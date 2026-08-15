import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { WorkspaceOperation, WorkspaceTask } from "@/contracts/workspace";
import { promotedChecklistTaskLinks } from "./task-promotion";

type TaskSourceDocumentInput = {
  documentJson: unknown;
  markdown: string;
  wordCount: number;
  expectedRevision: number;
};

/**
 * Builds the atomic promotion operations for linked, titled items not yet in
 * SQLite.
 *
 * Only the first operation carries the document. `save_document` matches on
 * `WHERE revision = expectedRevision`, so a second document-bearing operation
 * in the same batch would see the revision the first one already advanced and
 * fail the whole transaction with a revision conflict — losing the document
 * save along with every promotion. The remaining links are therefore plain
 * `create_task` operations, which re-prove their link against the document the
 * first operation already stored inside the same transaction.
 */
export function taskPromotionOperations(
  document: ProseMirrorNode,
  noteId: string,
  source: TaskSourceDocumentInput,
  knownTasks: ReadonlyMap<string, WorkspaceTask>,
  at: number,
): WorkspaceOperation[] {
  return promotedChecklistTaskLinks(document, noteId, at)
    .filter((link) => !knownTasks.has(link.taskId))
    .map((link, index) => {
      const task = {
        id: link.taskId,
        title: link.title,
        status: link.status,
        priority: "medium" as const,
        dueDate: null,
        description: "",
        tagIds: [],
        assigneeIds: [],
        source: { noteId, blockId: link.sourceBlockId },
        detachedAt: null,
        createdAt: at,
        updatedAt: at,
      };
      return index === 0
        ? {
            type: "promote_checklist_task" as const,
            task,
            document: { noteId, ...source },
          }
        : { type: "create_task" as const, task };
    });
}
