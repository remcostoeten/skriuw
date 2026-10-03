import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { commitOperations } from "@/store/commit";
import type { NoteTemplate } from "./model";
import { planTemplateNote } from "./plan";

export async function createNoteFromTemplate(
  store: RendererStore,
  template: NoteTemplate,
  parentId: string | null,
): Promise<void> {
  const plan = planTemplateNote(template, parentId, Date.now(), () => crypto.randomUUID());
  await commitOperations(store, [...plan.operations]);
}
