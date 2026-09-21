/**
 * The checklist half of a task's source note: reading `check_item` nodes out
 * of a document, and writing the two edits a task surface makes to one —
 * ticking its box and linking or unlinking it from a task record.
 *
 * `TaskSourceDocument` carries document JSON and Markdown together, and the
 * backend stores what it is handed, so both halves have to move at once. The
 * mobile client has no ProseMirror instance to re-serialize with: the editor
 * lives in the webview (ADR-0048) and the tasks surface runs in React Native.
 * The Markdown half is therefore a line rewrite anchored to the document's own
 * checklist order, and any note whose Markdown does not line up with its JSON
 * is refused rather than guessed at.
 */

export type ChecklistItem = {
  /** Position among the document's `check_item` nodes, in document order. */
  index: number;
  checked: boolean;
  taskId: string | null;
  blockId: string | null;
  title: string;
};

export type ChecklistAlignment = {
  documentJson: unknown;
  items: readonly ChecklistItem[];
  /** The Markdown line each item occupies, at the item's own position. */
  lineNumbers: readonly number[];
  lines: readonly string[];
};

export type DocumentEdit = {
  documentJson: unknown;
  markdown: string;
};

export type BlockLookup =
  | { status: "found"; item: ChecklistItem }
  | { status: "missing" }
  | { status: "ambiguous" };

type JsonNode = {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
  text?: unknown;
};

/** `- [x] ` as `check_list`/`check_item` serialize it, at any nesting depth. */
const CHECKLIST_LINE = /^(\s*)[-*+] \[([ xX])\](?=\s|$)/;

const CHECKBOX = /^(\s*[-*+] \[)([ xX])(\])/;

const FENCE = /^\s*(?:```|~~~)/;

const TASK_MARKER = /<!--skriuw-task:([A-Za-z0-9_-]{1,128})(?::([A-Za-z0-9_-]{1,128}))?-->/;

const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

export function isTaskIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function isJsonNode(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null;
}

function inlineText(value: unknown): string {
  if (!isJsonNode(value)) {
    return "";
  }
  let text = typeof value.text === "string" ? value.text : "";
  if (Array.isArray(value.content)) {
    for (const child of value.content) {
      text += inlineText(child);
    }
  }
  return text;
}

/** The title an item contributes, which is its first paragraph and nothing else. */
function checkItemTitle(node: JsonNode): string {
  const first = Array.isArray(node.content) ? node.content[0] : undefined;
  return isJsonNode(first) && first.type === "paragraph" ? inlineText(first).trim() : "";
}

function attribute(node: JsonNode, name: string): string | null {
  const value = node.attrs?.[name];
  return isTaskIdentifier(value) ? value : null;
}

function readItem(node: JsonNode, index: number): ChecklistItem {
  return {
    index,
    checked: node.attrs?.checked === true,
    taskId: attribute(node, "taskId"),
    blockId: attribute(node, "blockId"),
    title: checkItemTitle(node),
  };
}

type Counter = { next: number };

function walkCheckItems(
  value: unknown,
  counter: Counter,
  visit: (node: JsonNode, index: number) => JsonNode | null,
): { node: unknown; changed: boolean } {
  if (!isJsonNode(value)) {
    return { node: value, changed: false };
  }
  let current = value;
  let changed = false;
  if (current.type === "check_item") {
    const replacement = visit(current, counter.next);
    counter.next += 1;
    if (replacement !== null) {
      current = replacement;
      changed = true;
    }
  }
  if (Array.isArray(current.content)) {
    const children = current.content.map((child) => walkCheckItems(child, counter, visit));
    if (children.some((child) => child.changed)) {
      current = { ...current, content: children.map((child) => child.node) };
      changed = true;
    }
  }
  return { node: current, changed };
}

/** Every `check_item` in the document, in the order the Markdown lists them. */
export function checklistItems(documentJson: unknown): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  walkCheckItems(documentJson, { next: 0 }, (node, index) => {
    items.push(readItem(node, index));
    return null;
  });
  return items;
}

function checklistLineNumbers(lines: readonly string[]): number[] {
  const numbers: number[] = [];
  let fenced = false;
  lines.forEach((line, number) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return;
    }
    if (!fenced && CHECKLIST_LINE.test(line)) {
      numbers.push(number);
    }
  });
  return numbers;
}

function lineIsChecked(line: string): boolean {
  return (line.match(CHECKLIST_LINE)?.[2] ?? " ").toLowerCase() === "x";
}

/** An item carries its marker in Markdown only once it has a title to carry it on. */
function expectsMarker(item: ChecklistItem): boolean {
  return item.taskId !== null && item.title.length > 0;
}

function markerAgrees(line: string, item: ChecklistItem): boolean {
  const marker = line.match(TASK_MARKER);
  if (!expectsMarker(item)) {
    return marker === null;
  }
  if (marker === null || marker[1] !== item.taskId) {
    return false;
  }
  return marker[2] === undefined || marker[2] === item.blockId;
}

/**
 * Pairs the document's checklist items with the Markdown lines that spell
 * them, or reports that it cannot. Alignment is positional and then proved:
 * every pair must agree about the tick and about the task marker, so a
 * document whose Markdown was produced some other way — a raw-Markdown note, a
 * checklist inside a quote, a fence this scanner read wrong — fails here
 * rather than being rewritten on a guess.
 */
export function alignChecklist(documentJson: unknown, markdown: string): ChecklistAlignment | null {
  const items = checklistItems(documentJson);
  const lines = markdown.split("\n");
  const lineNumbers = checklistLineNumbers(lines);
  if (lineNumbers.length !== items.length) {
    return null;
  }
  const agrees = items.every((item, position) => {
    const line = lines[lineNumbers[position] ?? -1];
    return line !== undefined && lineIsChecked(line) === item.checked && markerAgrees(line, item);
  });
  return agrees ? { documentJson, items, lineNumbers, lines } : null;
}

/** The item a task's source block points at; duplicates are reported, not picked. */
export function findByBlockId(alignment: ChecklistAlignment, blockId: string): BlockLookup {
  const matches = alignment.items.filter((item) => item.blockId === blockId);
  if (matches.length === 0) {
    return { status: "missing" };
  }
  if (matches.length > 1) {
    return { status: "ambiguous" };
  }
  return { status: "found", item: matches[0]! };
}

function markerText(taskId: string, blockId: string): string {
  return `<!--skriuw-task:${taskId}:${blockId}-->`;
}

function withCheckbox(line: string, checked: boolean): string | null {
  const match = line.match(CHECKBOX);
  if (!match) {
    return null;
  }
  return `${match[1]}${checked ? "x" : " "}${match[3]}${line.slice(match[0].length)}`;
}

/** Trailing whitespace is kept where it was so a CRLF note stays a CRLF note. */
function withMarker(line: string, marker: string): string {
  const body = line.replace(/\s+$/, "");
  return `${body} ${marker}${line.slice(body.length)}`;
}

function withoutMarker(line: string, marker: string): string | null {
  const at = line.indexOf(marker);
  if (at === -1) {
    return null;
  }
  const before = line.slice(0, at).replace(/ $/, "");
  return `${before}${line.slice(at + marker.length)}`;
}

function edited(
  alignment: ChecklistAlignment,
  index: number,
  rewriteNode: (node: JsonNode) => JsonNode,
  rewriteLine: (line: string) => string | null,
): DocumentEdit | null {
  const lineNumber = alignment.lineNumbers[index];
  const line = lineNumber === undefined ? undefined : alignment.lines[lineNumber];
  if (lineNumber === undefined || line === undefined) {
    return null;
  }
  const nextLine = rewriteLine(line);
  if (nextLine === null) {
    return null;
  }
  const { node, changed } = walkCheckItems(alignment.documentJson, { next: 0 }, (target, at) =>
    at === index ? rewriteNode(target) : null,
  );
  if (!changed) {
    return null;
  }
  const lines = [...alignment.lines];
  lines[lineNumber] = nextLine;
  return { documentJson: node, markdown: lines.join("\n") };
}

export function tickItem(
  alignment: ChecklistAlignment,
  index: number,
  checked: boolean,
): DocumentEdit | null {
  return edited(
    alignment,
    index,
    (node) => ({ ...node, attrs: { ...node.attrs, checked } }),
    (line) => withCheckbox(line, checked),
  );
}

export function linkItem(
  alignment: ChecklistAlignment,
  index: number,
  taskId: string,
  blockId: string,
): DocumentEdit | null {
  const marker = markerText(taskId, blockId);
  return edited(
    alignment,
    index,
    (node) => ({ ...node, attrs: { ...node.attrs, taskId, blockId } }),
    (line) => withMarker(line, marker),
  );
}

export function unlinkItem(alignment: ChecklistAlignment, index: number): DocumentEdit | null {
  const item = alignment.items[index];
  if (item?.taskId === null || item?.blockId === null || item === undefined) {
    return null;
  }
  const marker = markerText(item.taskId, item.blockId);
  return edited(
    alignment,
    index,
    (node) => ({ ...node, attrs: { ...node.attrs, taskId: null, blockId: null } }),
    (line) => withoutMarker(line, marker),
  );
}
