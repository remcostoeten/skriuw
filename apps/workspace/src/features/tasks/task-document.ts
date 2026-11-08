import { isRecurrence } from "@skriuw/renderer-core/tasks/recurrence";

export type JsonNode = {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
  text?: unknown;
  marks?: unknown;
};

export type SubtaskPath = {
  list: number;
  item: number;
};

export type Subtask = {
  path: SubtaskPath;
  title: string;
  done: boolean;
  taskId: string | null;
  blockId: string | null;
};

export type CheckItemFacts = {
  recurrence: string | null;
  subtasks: { done: number; total: number };
};

export type ContextLine = {
  number: number;
  text: string;
  current: boolean;
  heading: boolean;
};

const NO_FACTS: CheckItemFacts = { recurrence: null, subtasks: { done: 0, total: 0 } };

const CONTEXT_RADIUS = 3;

/** The private link comment the Markdown serializer appends to a promoted checklist line. */
const TASK_MARKER = /\s*<!--skriuw-task:[^>]*-->/g;

const factsByDocument = new WeakMap<JsonNode, Map<string, CheckItemFacts>>();

export function isJsonNode(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null;
}

function children(node: JsonNode): readonly unknown[] {
  return Array.isArray(node.content) ? node.content : [];
}

function textOf(value: unknown): string {
  if (!isJsonNode(value)) return "";
  if (typeof value.text === "string") return value.text;
  return children(value).map(textOf).join("");
}

function stringAttr(node: JsonNode, name: string): string | null {
  const value = node.attrs?.[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * @name findCheckItem
 * @description The one `check_item` in a stored document whose `blockId`
 * matches, or null when it is missing or appears more than once.
 *
 * @example
 * const item = findCheckItem(record.documentJson, task.source.blockId);
 */
export function findCheckItem(documentJson: unknown, blockId: string): JsonNode | null {
  const found: JsonNode[] = [];
  function visit(value: unknown): void {
    if (!isJsonNode(value) || found.length > 1) return;
    if (value.type === "check_item" && value.attrs?.blockId === blockId) found.push(value);
    for (const child of children(value)) visit(child);
  }
  visit(documentJson);
  return found.length === 1 ? (found[0] ?? null) : null;
}

/**
 * @name subtasksOf
 * @description The checklist items nested directly under a task's checklist
 * item, with the path that addresses each one inside it.
 *
 * @example
 * subtasksOf(item).filter((subtask) => subtask.done).length;
 */
export function subtasksOf(item: JsonNode): Subtask[] {
  const subtasks: Subtask[] = [];
  children(item).forEach((child, list) => {
    if (!isJsonNode(child) || child.type !== "check_list") return;
    children(child).forEach((entry, index) => {
      if (!isJsonNode(entry) || entry.type !== "check_item") return;
      subtasks.push({
        path: { list, item: index },
        title: textOf(children(entry)[0]).trim(),
        done: entry.attrs?.checked === true,
        taskId: stringAttr(entry, "taskId"),
        blockId: stringAttr(entry, "blockId"),
      });
    });
  });
  return subtasks;
}

/**
 * @name recurrenceOf
 * @description The repeat rule stored on a checklist item, when it is a valid
 * rule.
 *
 * @example
 * recurrenceOf(item); // "every week"
 */
export function recurrenceOf(item: JsonNode): string | null {
  const recurrence = item.attrs?.recurrence;
  return isRecurrence(recurrence) ? recurrence : null;
}

function indexFacts(documentJson: JsonNode): Map<string, CheckItemFacts> {
  const facts = new Map<string, CheckItemFacts>();
  const duplicates = new Set<string>();
  function visit(value: unknown): void {
    if (!isJsonNode(value)) return;
    const blockId = value.type === "check_item" ? stringAttr(value, "blockId") : null;
    if (blockId !== null) {
      if (facts.has(blockId)) duplicates.add(blockId);
      const subtasks = subtasksOf(value);
      facts.set(blockId, {
        recurrence: recurrenceOf(value),
        subtasks: {
          done: subtasks.filter((subtask) => subtask.done).length,
          total: subtasks.length,
        },
      });
    }
    for (const child of children(value)) visit(child);
  }
  visit(documentJson);
  for (const blockId of duplicates) facts.delete(blockId);
  return facts;
}

/**
 * @name checkItemFacts
 * @description The repeat rule and subtask counts of a task's checklist item.
 * The index of a document is built once per stored document object, so
 * projecting every task costs one walk per changed note rather than one per
 * task.
 *
 * @example
 * checkItemFacts(record.documentJson, task.source.blockId).subtasks.total;
 */
export function checkItemFacts(documentJson: unknown, blockId: string): CheckItemFacts {
  if (!isJsonNode(documentJson)) return NO_FACTS;
  let index = factsByDocument.get(documentJson);
  if (index === undefined) {
    index = indexFacts(documentJson);
    factsByDocument.set(documentJson, index);
  }
  return index.get(blockId) ?? NO_FACTS;
}

/**
 * @name taskContextLines
 * @description The Markdown lines around a task's checklist line, numbered
 * as they appear in the note, with the private link marker removed. The task
 * line and its nested lines are marked current. Empty when the note no longer
 * carries the task.
 *
 * @example
 * taskContextLines(record.markdown, task.id).find((line) => line.current)?.number;
 */
export function taskContextLines(markdown: string, taskId: string): ContextLine[] {
  const lines = markdown.split("\n");
  const marker = `<!--skriuw-task:${taskId}`;
  const start = lines.findIndex(
    (line) => line.includes(`${marker}-->`) || line.includes(`${marker}:`),
  );
  if (start === -1) return [];
  const indent = (lines[start] ?? "").search(/\S/);
  let end = start;
  for (let index = start + 1; index < lines.length; index += 1) {
    const next = lines[index] ?? "";
    if (next.trim().length === 0) continue;
    if (next.search(/\S/) <= indent) break;
    end = index;
  }
  const from = Math.max(0, start - CONTEXT_RADIUS);
  const to = Math.min(lines.length - 1, end + CONTEXT_RADIUS);
  const context: ContextLine[] = [];
  for (let index = from; index <= to; index += 1) {
    const text = (lines[index] ?? "").replace(TASK_MARKER, "");
    context.push({
      number: index + 1,
      text,
      current: index >= start && index <= end,
      heading: /^#{1,6} /.test(text),
    });
  }
  return context;
}
