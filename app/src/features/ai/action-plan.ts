export const MAX_PLAN_ITEMS = 50;
export const MAX_TASK_TITLE_BYTES = 500;
export const MAX_TAG_NAME_BYTES = 64;

/**
 * One proposed change in a reviewable plan. Nothing here has touched the
 * workspace: a plan is only ever applied through the ordinary domain
 * operations, and only after the writer confirms the items they want.
 */
export type AiPlanItem = {
  key: string;
  text: string;
};

export type AiPlanParse =
  | { ok: true; items: readonly AiPlanItem[] }
  | { ok: false; message: string };

const BULLET = /^\s*(?:[-*+•]|\d+[.)])\s+/;
const CHECKBOX = /^\[[ xX]\]\s*/;
const TRAILING_PUNCTUATION = /[.,;:]+$/;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function candidateLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.replace(BULLET, "").replace(CHECKBOX, "").trim())
    .filter((line) => line.length > 0);
}

function collect(
  lines: readonly string[],
  normalize: (line: string) => string | null,
): AiPlanItem[] {
  const seen = new Set<string>();
  const items: AiPlanItem[] = [];
  for (const line of lines) {
    const text = normalize(line);
    if (text === null) {
      continue;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({ key, text });
  }
  return items;
}

function parsed(items: readonly AiPlanItem[], noun: string): AiPlanParse {
  if (items.length === 0) {
    return {
      ok: false,
      message: `The model did not return a usable list of ${noun}. Try again, or pick a different model.`,
    };
  }
  if (items.length > MAX_PLAN_ITEMS) {
    return {
      ok: false,
      message: `The model proposed ${items.length} ${noun}; the limit is ${MAX_PLAN_ITEMS}. Run it on a smaller note.`,
    };
  }
  return { ok: true, items };
}

/**
 * Reads the extract-tasks output as a plan. Prose that came back instead of a
 * list is rejected rather than guessed at, so a confirmed plan never contains a
 * sentence of commentary posing as a task.
 */
export function parseTaskPlan(output: string): AiPlanParse {
  const items = collect(candidateLines(output), (line) => {
    const text = line.replace(TRAILING_PUNCTUATION, "").trim();
    if (text.length === 0 || byteLength(text) > MAX_TASK_TITLE_BYTES) {
      return null;
    }
    return text;
  });
  return parsed(items, "tasks");
}

/**
 * Reads the suggest-tags output as a plan. Tag names are normalised the way the
 * mention menu would accept them: no leading `#`, no interior whitespace.
 */
export function parseTagPlan(output: string): AiPlanParse {
  const items = collect(candidateLines(output), (line) => {
    const text = line
      .replace(/^#+/, "")
      .replace(TRAILING_PUNCTUATION, "")
      .trim()
      .replace(/\s+/g, "-");
    if (text.length === 0 || byteLength(text) > MAX_TAG_NAME_BYTES) {
      return null;
    }
    return text;
  });
  return parsed(items, "tags");
}

export function parseActionPlan(outcome: "tasks" | "tags", output: string): AiPlanParse {
  return outcome === "tasks" ? parseTaskPlan(output) : parseTagPlan(output);
}

/** The items a plan would still apply, given the ones the writer unticked. */
export function keptPlanItems(
  items: readonly AiPlanItem[],
  excluded: ReadonlySet<string>,
): readonly AiPlanItem[] {
  return items.filter((item) => !excluded.has(item.key));
}

export function planApplyError(
  outcome: "tasks" | "tags",
  selected: readonly AiPlanItem[],
): string | null {
  if (selected.length > 0) {
    return null;
  }
  return `Choose at least one ${outcome === "tasks" ? "task" : "tag"} to add.`;
}
