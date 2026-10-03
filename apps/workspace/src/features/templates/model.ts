import type { Node } from "prosemirror-model";
import { BUILT_IN_PROPERTY_TEMPLATES } from "@skriuw/renderer-core/properties/templates";
import type { NotePropertyTemplate } from "@skriuw/renderer-core/properties/types";

export type TemplateIdFactory = () => string;

export type NoteTemplate = {
  id: string;
  sourceNoteId?: string;
  defaultParentId?: string | null;
  propertyTemplate?: NotePropertyTemplate;
  buildDocument?: (at: number, createId: TemplateIdFactory) => Node;
  name: string;
  description: string;
  /**
   * Built-in property template applied alongside the scaffold, so a meeting
   * note gets meeting fields without a second trip to the metadata panel.
   */
  propertyTemplateId: string | null;
  buildMarkdown: (at: number) => string;
};

export function templatePropertyTemplate(template: NoteTemplate): NotePropertyTemplate | null {
  if (template.propertyTemplate) return template.propertyTemplate;
  if (template.propertyTemplateId === null) {
    return null;
  }
  return (
    BUILT_IN_PROPERTY_TEMPLATES.find((entry) => entry.id === template.propertyTemplateId) ?? null
  );
}

export function filterNoteTemplates(
  templates: readonly NoteTemplate[],
  query: string,
): NoteTemplate[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [...templates];
  }
  return templates.filter(
    (template) =>
      template.name.toLowerCase().includes(needle) ||
      template.description.toLowerCase().includes(needle),
  );
}
