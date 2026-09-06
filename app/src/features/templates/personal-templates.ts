import type { WorkspaceSettings } from "@/contracts/workspace";
import { withFreshBlockIds } from "@/store/actions/duplicate-note";
import { commitOperations } from "@/store/actions/workspace";
import type { RendererState, RendererStore } from "@/store/types";
import { flushPendingWork } from "@/shell/pending-work";
import { productSchema } from "@/features/editor/schema";
import type { NoteTemplate } from "./note-templates";

/** Source notes remain canonical; this preference only records picker membership. */
export function personalTemplateIds(
  settings: WorkspaceSettings,
): readonly string[] {
  const value = settings.noteTemplateIds;
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 200 ||
    value.some(
      (id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id),
    )
  ) {
    throw new Error(
      "Saved note templates are invalid. Restore a verified workspace backup.",
    );
  }
  return value as string[];
}

/** Registers the current durable note as a reusable template. */
export async function savePersonalTemplate(
  store: RendererStore,
  noteId: string,
): Promise<void> {
  await flushPendingWork();
  const state = store.getState();
  if (state.nodes.get(noteId)?.kind !== "note")
    throw new Error("This note is no longer available.");
  const ids = personalTemplateIds(state.settings);
  if (ids.includes(noteId)) return;
  if (ids.length >= 200)
    throw new Error(
      "Remove a saved template before adding another (limit: 200).",
    );
  await commitOperations(store, [
    {
      type: "update_settings",
      settings: { ...state.settings, noteTemplateIds: [...ids, noteId] },
    },
  ]);
}

/** Removes picker membership without deleting the source note. */
export async function removePersonalTemplate(
  store: RendererStore,
  noteId: string,
): Promise<void> {
  const settings = store.getState().settings;
  await commitOperations(store, [
    {
      type: "update_settings",
      settings: {
        ...settings,
        noteTemplateIds: personalTemplateIds(settings).filter(
          (id) => id !== noteId,
        ),
      },
    },
  ]);
}

function expandTemplateText(value: unknown, date: string): unknown {
  if (Array.isArray(value))
    return value
      .filter(
        (entry) =>
          !(
            typeof entry === "object" &&
            entry !== null &&
            "type" in entry &&
            entry.type === "annotation"
          ),
      )
      .map((entry) => expandTemplateText(entry, date));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "text" && typeof entry === "string"
        ? entry.replaceAll("{{date}}", date)
        : expandTemplateText(entry, date),
    ]),
  );
}

/** Projects saved source notes into the picker without copying their content into preferences. */
export function personalTemplates(state: RendererState): NoteTemplate[] {
  return personalTemplateIds(state.settings).flatMap((id) => {
    const node = state.nodes.get(id);
    const document = state.documents.get(id);
    if (node?.kind !== "note" || !document) return [];
    return [
      {
        id: `personal_${id}`,
        sourceNoteId: id,
        name: node.title,
        description: "Personal template · edit the source note to update",
        defaultParentId: node.parentId,
        propertyTemplateId: null,
        propertyTemplate: {
          id: `personal_${id}`,
          name: node.title,
          position: 0,
          properties: (state.propertiesByNoteId.get(id) ?? []).map(
            ({ noteId: _noteId, ...field }) => field,
          ),
        },
        buildMarkdown: () => document.markdown,
        buildDocument: (at: number, createId: () => string) => {
          const date = new Date(at);
          const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          return productSchema.nodeFromJSON(
            withFreshBlockIds(
              expandTemplateText(document.documentJson, stamp),
              createId,
              new Map(),
            ),
          );
        },
      },
    ];
  });
}
