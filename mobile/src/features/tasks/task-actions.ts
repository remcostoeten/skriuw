import { commitOperations, type WorkspaceSession } from "../../bridge/commit";
import { newNodeId } from "../../shell/identity";
import {
  buildChecklistPromotion,
  buildPromotionUndo,
  buildTaskToggle,
  type TaskWriteResult,
} from "./task-operations";

export type TaskAction =
  | { status: "committed"; taskId: string; title: string; done: boolean }
  | { status: "refused"; message: string };

/**
 * Every write this surface makes takes the same route as the rest of the
 * shell: the store changes synchronously and the batch goes to the core, so a
 * tick paints in the frame it was tapped in and a rejection rolls the store
 * back to what is durable (`mobile/src/bridge/commit.ts`).
 */
async function commit(
  session: WorkspaceSession,
  result: TaskWriteResult,
  committed: Omit<Extract<TaskAction, { status: "committed" }>, "status">,
): Promise<TaskAction> {
  if (result.status === "refused") {
    return { status: "refused", message: result.message };
  }
  await commitOperations(session, result.operations);
  return { status: "committed", ...committed };
}

export async function toggleTask(session: WorkspaceSession, taskId: string): Promise<TaskAction> {
  const state = session.store.getState();
  const task = state.tasks.get(taskId);
  const result = buildTaskToggle(state, taskId, Date.now());
  return commit(session, result, {
    taskId,
    title: task?.title ?? "",
    done: task?.status !== "done",
  });
}

/**
 * Promotes the checklist item a person picked. The identities are minted here
 * and are what the document and the record both carry, which is what makes the
 * link provable on the backend (ADR-0031).
 */
export async function promoteChecklistItem(
  session: WorkspaceSession,
  noteId: string,
  itemIndex: number,
): Promise<TaskAction> {
  const taskId = newNodeId();
  const blockId = newNodeId();
  const state = session.store.getState();
  const result = buildChecklistPromotion(state, {
    noteId,
    itemIndex,
    taskId,
    blockId,
    at: Date.now(),
  });
  const title =
    result.status === "ready" && result.operations[0]?.type === "promote_checklist_task"
      ? result.operations[0].task.title
      : "";
  return commit(session, result, { taskId, title, done: false });
}

export async function undoPromotion(
  session: WorkspaceSession,
  taskId: string,
): Promise<TaskAction> {
  const state = session.store.getState();
  const task = state.tasks.get(taskId);
  const result = buildPromotionUndo(state, taskId, Date.now());
  return commit(session, result, { taskId, title: task?.title ?? "", done: false });
}
