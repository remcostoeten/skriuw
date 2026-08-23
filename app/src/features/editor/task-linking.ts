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
 * The one batch that durably writes a note.
 *
 * ADR 0031 makes promotion indivisible — `PromoteChecklistTask` writes the
 * source document and inserts the task in a single transaction — so a save
 * that promotes carries the document inside the promotion batch, and a
 * standalone `save_document` stands in only when the save promotes nothing.
 * Following the save with a separate promotion batch would write the document
 * twice per task-creating save, re-running full-text indexing and reference
 * replacement for the second write, and would leave an operation group that
 * could apply one half.
 */
export function documentSaveOperations(
  document: ProseMirrorNode,
  noteId: string,
  source: TaskSourceDocumentInput,
  knownTasks: ReadonlyMap<string, WorkspaceTask>,
  at: number,
): WorkspaceOperation[] {
  const promotions = taskPromotionOperations(document, noteId, source, knownTasks, at);
  return promotions.length > 0
    ? promotions
    : [{ type: "save_document", noteId, ...source, at }];
}

/**
 * The promotion half of that batch: linked, titled items not yet in SQLite.
 *
 * Only the first operation carries the document. `save_document` matches on
 * `WHERE revision = expectedRevision`, so a second document-bearing operation
 * in the same batch would see the revision the first one already advanced and
 * fail the whole transaction with a revision conflict — losing the document
 * save along with every promotion. The remaining links are therefore plain
 * `create_task` operations, which re-prove their link against the document the
 * first operation already stored inside the same transaction.
 */
function taskPromotionOperations(
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
