import {
  type NoteProperty,
  type NotePropertyColor,
  type NotePropertyField,
  type NotePropertyTemplate,
  type NotePropertyType,
  type NotePropertyValue,
  type PropertyIdFactory,
} from "./types";
import { normalizeNotePropertyFields, propertyValidationError } from "./value";

type TemplateFieldInput = {
  id: string;
  name: string;
  type: NotePropertyType;
  options?: ReadonlyArray<readonly [string, NotePropertyColor]>;
};

export const BUILT_IN_PROPERTY_TEMPLATES: readonly NotePropertyTemplate[] = [
  template("blank", "Blank", 0, []),
  template("meeting", "Meeting", 1, [
    field("meeting_date", "Date", "date"),
    field("meeting_attendees", "Attendees", "person"),
    field("meeting_status", "Status", "select", [
      ["Scheduled", "blue"],
      ["In progress", "amber"],
      ["Done", "green"],
    ]),
    field("meeting_location", "Location", "location"),
  ]),
  template("project", "Project", 2, [
    field("project_status", "Status", "select", [
      ["Backlog", "gray"],
      ["Planned", "blue"],
      ["Active", "amber"],
      ["Shipped", "green"],
    ]),
    field("project_priority", "Priority", "select", [
      ["Low", "gray"],
      ["Medium", "amber"],
      ["High", "red"],
    ]),
    field("project_owner", "Owner", "person"),
    field("project_due", "Due", "date"),
    field("project_tags", "Tags", "multi-select"),
    field("project_link", "Link", "url"),
  ]),
  template("contact", "Contact", 3, [
    field("contact_email", "Email", "email"),
    field("contact_phone", "Phone", "phone"),
    field("contact_company", "Company", "text"),
    field("contact_location", "Location", "location"),
  ]),
  template("journal", "Journal", 4, [
    field("journal_date", "Date", "date"),
    field("journal_mood", "Mood", "select", [
      ["Great", "green"],
      ["Good", "teal"],
      ["Okay", "amber"],
      ["Low", "rose"],
    ]),
    field("journal_energy", "Energy", "rating"),
  ]),
  template("idea", "Idea", 5, [
    field("idea_status", "Status", "select", [
      ["Draft", "gray"],
      ["Exploring", "blue"],
      ["Shipped", "green"],
    ]),
    field("idea_category", "Category", "select", [
      ["Product", "teal"],
      ["Writing", "amber"],
      ["Personal", "rose"],
    ]),
    field("idea_priority", "Priority", "select", [
      ["Low", "gray"],
      ["Medium", "amber"],
      ["High", "red"],
    ]),
    field("idea_tags", "Tags", "multi-select"),
  ]),
  template("reading", "Reading", 6, [
    field("reading_author", "Author", "text"),
    field("reading_source", "Source", "url"),
    field("reading_rating", "Rating", "rating"),
    field("reading_status", "Status", "select", [
      ["To read", "gray"],
      ["Reading", "amber"],
      ["Read", "green"],
    ]),
  ]),
];

export function instantiatePropertyTemplate(
  templateValue: NotePropertyTemplate,
  noteId: string,
  idFactory: PropertyIdFactory,
): NoteProperty[] {
  if (!noteId) throw propertyValidationError(["note ID cannot be empty"]);
  const instantiated = normalizeNotePropertyFields(templateValue.properties).map((property) => {
    const optionIds = new Map<string, string>();
    const options = property.options.map((option) => {
      const id = idFactory("option");
      optionIds.set(option.id, id);
      return { ...option, id };
    });
    return {
      ...property,
      id: idFactory("property"),
      options,
      value: remapOptionValue(property.value, optionIds),
    };
  });
  return normalizeNotePropertyFields(instantiated).map((property) => ({ noteId, ...property }));
}

export function upsertPropertyTemplate(
  templates: readonly NotePropertyTemplate[],
  templateValue: NotePropertyTemplate,
): NotePropertyTemplate[] {
  const normalized = normalizeTemplate(templateValue);
  const index = templates.findIndex((entry) => entry.id === normalized.id);
  if (index < 0) {
    if (normalized.position !== templates.length) {
      throw propertyValidationError(["new template position must append to the ordered set"]);
    }
    return [...templates.map(cloneTemplate), normalized];
  }
  if (normalized.position !== templates[index]?.position) {
    throw propertyValidationError(["setting a template cannot reorder it"]);
  }
  return templates.map((entry, entryIndex) =>
    entryIndex === index ? normalized : cloneTemplate(entry),
  );
}

export function deletePropertyTemplate(
  templates: readonly NotePropertyTemplate[],
  templateId: string,
): NotePropertyTemplate[] {
  if (!templates.some((templateValue) => templateValue.id === templateId)) {
    throw propertyValidationError([`unknown property template ${templateId}`]);
  }
  return templates
    .filter((templateValue) => templateValue.id !== templateId)
    .map((templateValue, position) => ({ ...cloneTemplate(templateValue), position }));
}

export function reorderPropertyTemplates(
  templates: readonly NotePropertyTemplate[],
  orderedIds: readonly string[],
): NotePropertyTemplate[] {
  const current = new Set(templates.map((templateValue) => templateValue.id));
  const supplied = new Set(orderedIds);
  if (
    orderedIds.length !== templates.length ||
    supplied.size !== orderedIds.length ||
    orderedIds.some((id) => !current.has(id))
  ) {
    throw propertyValidationError(["template reorder must contain each owned ID exactly once"]);
  }
  const byId = new Map(templates.map((templateValue) => [templateValue.id, templateValue]));
  return orderedIds.map((id, position) => {
    const templateValue = byId.get(id);
    if (!templateValue) throw propertyValidationError([`unknown property template ${id}`]);
    return { ...cloneTemplate(templateValue), position };
  });
}

function template(
  id: string,
  name: string,
  position: number,
  properties: NotePropertyField[],
): NotePropertyTemplate {
  return {
    id,
    name,
    position,
    properties: properties.map((property, propertyPosition) => ({
      ...property,
      position: propertyPosition,
    })),
  };
}

function field(
  id: string,
  name: string,
  type: NotePropertyType,
  options: TemplateFieldInput["options"] = [],
): NotePropertyField {
  const propertyOptions = options.map(([label, color], index) => ({
    id: `${id}_option_${index}`,
    label,
    color,
  }));
  return {
    id,
    name,
    value: emptyValue(type),
    options: propertyOptions,
    position: 0,
  };
}

function emptyValue(type: NotePropertyType): NotePropertyValue {
  if (type === "number" || type === "select" || type === "rating") {
    return { valueVersion: 1, type, value: null } as NotePropertyValue;
  }
  if (type === "multi-select" || type === "person") {
    return { valueVersion: 1, type, value: [] } as NotePropertyValue;
  }
  if (type === "checkbox") return { valueVersion: 1, type, value: false };
  return { valueVersion: 1, type, value: "" } as NotePropertyValue;
}

function remapOptionValue(
  value: NotePropertyValue,
  optionIds: ReadonlyMap<string, string>,
): NotePropertyValue {
  if (value.type === "select") {
    return { ...value, value: value.value === null ? null : optionIds.get(value.value) ?? null };
  }
  if (value.type === "multi-select") {
    return {
      ...value,
      value: value.value.map((id) => {
        const mapped = optionIds.get(id);
        if (!mapped) throw propertyValidationError([`template references unknown option ${id}`]);
        return mapped;
      }),
    };
  }
  if (Array.isArray(value.value)) return { ...value, value: [...value.value] } as NotePropertyValue;
  return { ...value };
}

function normalizeTemplate(templateValue: NotePropertyTemplate): NotePropertyTemplate {
  if (
    !templateValue.id ||
    new TextEncoder().encode(templateValue.id).length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(templateValue.id)
  ) {
    throw propertyValidationError(["property template ID is invalid"]);
  }
  if (!templateValue.name.trim()) {
    throw propertyValidationError(["property template name cannot be empty"]);
  }
  if (new TextEncoder().encode(templateValue.name).length > 60) {
    throw propertyValidationError(["property template name is too long"]);
  }
  if (!Number.isSafeInteger(templateValue.position) || templateValue.position < 0) {
    throw propertyValidationError(["property template position must be non-negative"]);
  }
  return {
    id: templateValue.id,
    name: templateValue.name,
    position: templateValue.position,
    properties: normalizeNotePropertyFields(templateValue.properties),
  };
}

function cloneTemplate(templateValue: NotePropertyTemplate): NotePropertyTemplate {
  return {
    ...templateValue,
    properties: templateValue.properties.map((property) => ({
      ...property,
      value: Array.isArray(property.value.value)
        ? ({ ...property.value, value: [...property.value.value] } as NotePropertyValue)
        : { ...property.value },
      options: property.options.map((option) => ({ ...option })),
    })),
  };
}
