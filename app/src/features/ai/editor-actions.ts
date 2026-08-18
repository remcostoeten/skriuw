import type { AiCompletionRequest } from "@/contracts/ai";
import type { PromptParameters } from "@/contracts/workspace";
import type { AiModelSelection } from "./model-selection";

/**
 * Where an action reads its input from. `caret` is `note` truncated at the
 * cursor: continuing writing must not hand the model the text it is supposed
 * to be writing towards.
 */
export type AiActionScope = "selection" | "note" | "caret";

/**
 * What the run produces. `text` lands in the preview buffer and is applied as
 * one editor transaction; `tasks` and `tags` land in a reviewable plan and are
 * applied through the ordinary task and reference operations after
 * confirmation.
 */
export type AiActionOutcome = "text" | "title" | "tasks" | "tags";

export type AiActionInstruction = {
  label: string;
  placeholder: string;
  /** A blank instruction is allowed when the prompt names its own default. */
  required: boolean;
};

export type AiEditorAction = {
  id: string;
  promptId: string;
  label: string;
  scope: AiActionScope;
  outcome: AiActionOutcome;
  instruction: AiActionInstruction | null;
  keywords: readonly string[];
};

/**
 * Actions are data, not prompt text: each one names a built-in prompt from the
 * generated library (which a user-customised copy shadows), so the shipped
 * wording lives in `skriuw-domain` and nowhere else.
 */
export const AI_EDITOR_ACTIONS: readonly AiEditorAction[] = [
  {
    id: "rewrite",
    promptId: "rewrite",
    label: "Rewrite",
    scope: "selection",
    outcome: "text",
    instruction: null,
    keywords: ["reword", "rephrase", "paraphrase"],
  },
  {
    id: "improve",
    promptId: "improve",
    label: "Improve writing",
    scope: "selection",
    outcome: "text",
    instruction: null,
    keywords: ["polish", "sharpen", "better"],
  },
  {
    id: "fix-grammar",
    promptId: "fix-grammar",
    label: "Fix spelling and grammar",
    scope: "selection",
    outcome: "text",
    instruction: null,
    keywords: ["spelling", "grammar", "typo", "punctuation", "proofread"],
  },
  {
    id: "shorten",
    promptId: "shorten",
    label: "Make shorter",
    scope: "selection",
    outcome: "text",
    instruction: null,
    keywords: ["condense", "trim", "brief", "concise"],
  },
  {
    id: "lengthen",
    promptId: "lengthen",
    label: "Make longer",
    scope: "selection",
    outcome: "text",
    instruction: null,
    keywords: ["expand", "elaborate", "develop"],
  },
  {
    id: "simplify",
    promptId: "simplify",
    label: "Simplify",
    scope: "selection",
    outcome: "text",
    instruction: null,
    keywords: ["plain", "clarify", "readable", "explain"],
  },
  {
    id: "change-tone",
    promptId: "change-tone",
    label: "Change tone",
    scope: "selection",
    outcome: "text",
    instruction: {
      label: "Tone",
      placeholder: "friendly, formal, direct…",
      required: false,
    },
    keywords: ["voice", "formal", "casual", "friendly"],
  },
  {
    id: "translate",
    promptId: "translate",
    label: "Translate",
    scope: "selection",
    outcome: "text",
    instruction: {
      label: "Target language",
      placeholder: "Dutch, Frysk, Japanese…",
      required: false,
    },
    keywords: ["language", "localise", "localize"],
  },
  {
    id: "custom",
    promptId: "custom",
    label: "Custom instruction",
    scope: "selection",
    outcome: "text",
    instruction: {
      label: "Instruction",
      placeholder: "Turn this into a bulleted checklist…",
      required: true,
    },
    keywords: ["ask", "prompt", "instruct", "freeform"],
  },
  {
    id: "continue",
    promptId: "continue",
    label: "Continue writing",
    scope: "caret",
    outcome: "text",
    instruction: null,
    keywords: ["write", "finish", "keep going", "autocomplete"],
  },
  {
    id: "summarize",
    promptId: "summarize",
    label: "Summarize note",
    scope: "note",
    outcome: "text",
    instruction: null,
    keywords: ["summary", "tldr", "abstract", "recap"],
  },
  {
    id: "outline",
    promptId: "outline",
    label: "Outline note",
    scope: "note",
    outcome: "text",
    instruction: null,
    keywords: ["structure", "headings", "bullets", "skeleton"],
  },
  {
    id: "title",
    promptId: "title",
    label: "Suggest a title",
    scope: "note",
    outcome: "title",
    instruction: null,
    keywords: ["name", "heading", "rename"],
  },
  {
    id: "extract-tasks",
    promptId: "extract-tasks",
    label: "Extract tasks",
    scope: "note",
    outcome: "tasks",
    instruction: null,
    keywords: ["todo", "action items", "checklist", "tasks"],
  },
  {
    id: "suggest-tags",
    promptId: "suggest-tags",
    label: "Suggest tags",
    scope: "note",
    outcome: "tags",
    instruction: null,
    keywords: ["tag", "topics", "labels", "categorise", "categorize"],
  },
];

export function aiEditorAction(id: string): AiEditorAction | null {
  return AI_EDITOR_ACTIONS.find((action) => action.id === id) ?? null;
}

/** Actions offered for a live selection: the bubble menu and its palette twins. */
export function aiSelectionActions(): readonly AiEditorAction[] {
  return AI_EDITOR_ACTIONS.filter((action) => action.scope === "selection");
}

/** Actions that read the note rather than a selection. Palette only. */
export function aiNoteActions(): readonly AiEditorAction[] {
  return AI_EDITOR_ACTIONS.filter((action) => action.scope !== "selection");
}

/**
 * The origin recorded with the run at the provider seam. Each action gets its
 * own id so history can tell a rewrite from a translation without inspecting
 * prompts.
 */
export function aiActionOrigin(action: AiEditorAction): string {
  return `editor:${action.id}`;
}

export const MAX_AI_ACTION_INPUT_BYTES = 128 * 1024;
export const MAX_AI_ACTION_INSTRUCTION_BYTES = 500;
export const AI_ACTION_TIMEOUT_MS = 60_000;
export const AI_ACTION_RETRY_COUNT = 0;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Rejects an oversized or empty input with something the writer can act on.
 * The input is never trimmed to fit: silently shipping half a selection would
 * produce output that looks complete and is not.
 */
export function aiActionInputError(
  action: AiEditorAction,
  input: string,
): string | null {
  if (input.trim().length === 0) {
    if (action.scope === "selection") {
      return "Select some text first.";
    }
    if (action.scope === "caret") {
      return "Write something before asking for a continuation.";
    }
    return "This note is empty.";
  }
  const size = byteLength(input);
  if (size > MAX_AI_ACTION_INPUT_BYTES) {
    return `That is ${size.toLocaleString()} bytes; the limit is ${MAX_AI_ACTION_INPUT_BYTES.toLocaleString()} bytes. Send a smaller ${
      action.scope === "selection" ? "selection" : "note"
    } — it will not be truncated.`;
  }
  return null;
}

export function aiActionInstructionError(
  action: AiEditorAction,
  instruction: string,
): string | null {
  const shape = action.instruction;
  if (shape === null) {
    return null;
  }
  const trimmed = instruction.trim();
  if (shape.required && trimmed.length === 0) {
    return `${shape.label} is required.`;
  }
  const size = byteLength(trimmed);
  if (size > MAX_AI_ACTION_INSTRUCTION_BYTES) {
    return `${shape.label} is ${size.toLocaleString()} bytes; the limit is ${MAX_AI_ACTION_INSTRUCTION_BYTES.toLocaleString()} bytes.`;
  }
  return null;
}

/**
 * The user prompt exactly as it will be sent. Nothing else is added on the way
 * to the provider, so the preview a writer approves is the payload.
 */
export function aiActionUserPrompt(
  action: AiEditorAction,
  input: string,
  instruction: string,
): string {
  const trimmedInstruction = action.instruction === null ? "" : instruction.trim();
  if (trimmedInstruction.length === 0) {
    return input;
  }
  return `${action.instruction?.label}: ${trimmedInstruction}\n\n---\n\n${input}`;
}

export type AiActionRequestInput = {
  action: AiEditorAction;
  selection: AiModelSelection;
  systemPrompt: string;
  parameters: PromptParameters;
  input: string;
  instruction: string;
  requestId: string;
};

export function buildAiActionRequest(input: AiActionRequestInput): AiCompletionRequest {
  return {
    requestId: input.requestId,
    providerId: input.selection.providerId,
    modelId: input.selection.modelId,
    systemPrompt: input.systemPrompt,
    userPrompt: aiActionUserPrompt(input.action, input.input, input.instruction),
    parameters: {
      maxOutputBytes: input.parameters.maxOutputBytes,
      timeoutMs: AI_ACTION_TIMEOUT_MS,
      retryCount: AI_ACTION_RETRY_COUNT,
      temperatureMillis: input.parameters.temperatureMillis,
      topPMillis: null,
    },
  };
}
