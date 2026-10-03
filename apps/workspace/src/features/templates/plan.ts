import type { Node } from "prosemirror-model";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import { instantiatePropertyTemplate } from "@skriuw/renderer-core/properties/templates";
import type { PropertyIdFactory } from "@skriuw/renderer-core/properties/types";
import { documentTitleText } from "@/features/notes/duplicate";
import { boundTitle } from "@/features/notes/title";
import { parseProductMarkdown, serializeProductMarkdown } from "@/features/editor/schema";
import { templatePropertyTemplate, type NoteTemplate, type TemplateIdFactory } from "./model";

type CreateNoteOperation = Extract<WorkspaceOperation, { type: "create_note" }>;

export type TemplateDocument = {
  document: Node;
  documentJson: CreateNoteOperation["documentJson"];
  markdown: string;
  headingText: string;
};

/**
 * @name buildTemplateDocument
 * @description Renders `template` for the instant `at` into a canonical
 * document, its serialized Markdown, and the text of its first heading. The
 * Markdown is parsed and re-serialized so the stored pair is canonical.
 *
 * @example
 * const { documentJson, markdown } = buildTemplateDocument(template, Date.now(), createId);
 */
export function buildTemplateDocument(
  template: NoteTemplate,
  at: number,
  createId: TemplateIdFactory,
): TemplateDocument {
  const document =
    template.buildDocument?.(at, createId) ?? parseProductMarkdown(template.buildMarkdown(at));
  const documentJson = document.toJSON();
  return {
    document,
    documentJson,
    markdown: serializeProductMarkdown(document),
    headingText: documentTitleText(documentJson),
  };
}

export type NoteTemplatePlan = {
  noteId: string;
  title: string;
  operations: readonly WorkspaceOperation[];
};

/**
 * @name planTemplateNote
 * @description The operations that create a note from `template` inside
 * `parentId`. Pure so the scaffold and property composition stay
 * unit-testable; `createId` supplies every fresh id.
 *
 * @example
 * const plan = planTemplateNote(template, null, Date.now(), () => crypto.randomUUID());
 * await commitOperations(store, [...plan.operations]);
 */
export function planTemplateNote(
  template: NoteTemplate,
  parentId: string | null,
  at: number,
  createId: TemplateIdFactory,
): NoteTemplatePlan {
  const { documentJson, markdown, headingText } = buildTemplateDocument(template, at, createId);
  const noteId = createId();
  const title = boundTitle(headingText.length > 0 ? headingText : template.name);
  const operations: WorkspaceOperation[] = [
    {
      type: "create_note",
      id: noteId,
      title,
      placement: { parentId, position: { type: "last" } },
      documentJson,
      markdown,
      at,
    },
  ];
  const propertyTemplate = templatePropertyTemplate(template);
  if (propertyTemplate) {
    const createPropertyId: PropertyIdFactory = (kind) => `${kind}_${createId()}`;
    for (const property of instantiatePropertyTemplate(
      propertyTemplate,
      noteId,
      createPropertyId,
    )) {
      operations.push({ type: "set_note_property", property, at });
    }
  }
  operations.push({ type: "set_active_note", noteId });
  return { noteId, title, operations };
}
