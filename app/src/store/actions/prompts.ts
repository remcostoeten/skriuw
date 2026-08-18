import type { WorkspacePrompt } from "@/contracts/workspace";
import { showToast } from "@/shared/ui/toast";
import type { RendererStore } from "@/store/types";
import { commitOperations } from "./workspace";

function reportRejection(action: string) {
  return (error: unknown) => {
    console.error(`${action} rejected`, error);
  };
}

export function savePrompt(store: RendererStore, prompt: WorkspacePrompt): void {
  void commitOperations(store, [{ type: "set_prompt", prompt }]).catch(
    reportRejection("save prompt"),
  );
}

/**
 * Deleting a prompt goes through the same delete-then-offer-undo path as the
 * sidebar: the record is the whole undo payload, so restoring it is one
 * ordinary upsert rather than a special resurrection route.
 */
export function deletePrompt(store: RendererStore, prompt: WorkspacePrompt): void {
  void commitOperations(store, [{ type: "delete_prompt", id: prompt.id }]).catch(
    reportRejection("delete prompt"),
  );
  showToast({
    message:
      prompt.builtInId === null
        ? `Deleted “${prompt.name}”`
        : `Reset “${prompt.name}” to the built-in`,
    action: {
      label: "Undo",
      run: () => savePrompt(store, prompt),
    },
  });
}
