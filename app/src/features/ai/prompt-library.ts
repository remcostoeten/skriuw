import type {
  PromptInputShape,
  PromptParameters,
  WorkspacePrompt,
} from "@/contracts/workspace";
import type { RendererState } from "@/store/types";
import { BUILT_IN_PROMPTS, builtInPrompt, type BuiltInPrompt } from "./built-in-prompts";

export const MAX_PROMPT_NAME_BYTES = 80;
export const MAX_PROMPT_SYSTEM_BYTES = 8_000;
export const MAX_PROMPT_TEMPERATURE_MILLIS = 1_000;
export const MAX_PROMPT_OUTPUT_BYTES = 4 * 1024 * 1024;

/**
 * Where an entry in the library comes from.
 *
 * - `built-in` is shipped and untouched.
 * - `customised` is a shipped prompt the user edited: the stored copy shadows
 *   the shipped one, so a shipped update never overwrites the user's text and
 *   resetting means deleting the shadow.
 * - `user` is a prompt the user wrote, which shadows nothing.
 */
export type PromptOrigin = "built-in" | "customised" | "user";

export type PromptLibraryEntry = {
  key: string;
  name: string;
  systemPrompt: string;
  inputShape: PromptInputShape;
  parameters: PromptParameters;
  origin: PromptOrigin;
  builtInId: string | null;
  promptId: string | null;
  createdAt: number | null;
};

export function selectWorkspacePrompts(state: RendererState): ReadonlyMap<string, WorkspacePrompt> {
  return state.prompts;
}

function entryFromBuiltIn(builtIn: BuiltInPrompt): PromptLibraryEntry {
  return {
    key: `built-in:${builtIn.id}`,
    name: builtIn.name,
    systemPrompt: builtIn.systemPrompt,
    inputShape: builtIn.inputShape,
    parameters: builtIn.parameters,
    origin: "built-in",
    builtInId: builtIn.id,
    promptId: null,
    createdAt: null,
  };
}

function entryFromPrompt(prompt: WorkspacePrompt): PromptLibraryEntry {
  return {
    key: prompt.builtInId === null ? `prompt:${prompt.id}` : `built-in:${prompt.builtInId}`,
    name: prompt.name,
    systemPrompt: prompt.systemPrompt,
    inputShape: prompt.inputShape,
    parameters: prompt.parameters,
    origin: prompt.builtInId === null ? "user" : "customised",
    builtInId: prompt.builtInId,
    promptId: prompt.id,
    createdAt: prompt.createdAt,
  };
}

/**
 * The library as the user sees it: every shipped prompt in shipped order, with
 * a customised copy standing in for the built-in it shadows, followed by the
 * prompts the user wrote. A stored shadow whose built-in no longer ships is not
 * silently dropped — it stays as an ordinary user prompt so the text survives.
 */
export function promptLibraryEntries(
  prompts: ReadonlyMap<string, WorkspacePrompt>,
): PromptLibraryEntry[] {
  const shadows = new Map<string, WorkspacePrompt>();
  const own: WorkspacePrompt[] = [];
  for (const prompt of prompts.values()) {
    if (prompt.builtInId !== null && builtInPrompt(prompt.builtInId) !== null) {
      shadows.set(prompt.builtInId, prompt);
    } else {
      own.push(prompt);
    }
  }
  const entries = BUILT_IN_PROMPTS.map((builtIn) => {
    const shadow = shadows.get(builtIn.id);
    return shadow === undefined ? entryFromBuiltIn(builtIn) : entryFromPrompt(shadow);
  });
  own.sort((left, right) => left.createdAt - right.createdAt || (left.id < right.id ? -1 : 1));
  for (const prompt of own) {
    entries.push({ ...entryFromPrompt(prompt), origin: "user", builtInId: null });
  }
  return entries;
}

export type PromptDraft = {
  id: string;
  name: string;
  systemPrompt: string;
  inputShape: PromptInputShape;
  temperature: string;
  maxOutputBytes: string;
  builtInId: string | null;
  createdAt: number;
};

export function promptDraftFrom(entry: PromptLibraryEntry, id: string, at: number): PromptDraft {
  return {
    id: entry.promptId ?? id,
    name: entry.name,
    systemPrompt: entry.systemPrompt,
    inputShape: entry.inputShape,
    temperature:
      entry.parameters.temperatureMillis === null
        ? ""
        : `${entry.parameters.temperatureMillis / 1000}`,
    maxOutputBytes: `${entry.parameters.maxOutputBytes}`,
    builtInId: entry.builtInId,
    createdAt: entry.createdAt ?? at,
  };
}

export function newPromptDraft(id: string, at: number): PromptDraft {
  return {
    id,
    name: "",
    systemPrompt: "",
    inputShape: "selection",
    temperature: "",
    maxOutputBytes: "65536",
    builtInId: null,
    createdAt: at,
  };
}

export function duplicatePromptDraft(
  entry: PromptLibraryEntry,
  id: string,
  at: number,
): PromptDraft {
  return {
    ...promptDraftFrom(entry, id, at),
    id,
    name: duplicateName(entry.name),
    builtInId: null,
    createdAt: at,
  };
}

function duplicateName(name: string): string {
  const suffix = " copy";
  const trimmed = name.trim();
  const room = MAX_PROMPT_NAME_BYTES - byteLength(suffix);
  return `${trimmed.length > room ? trimmed.slice(0, room).trimEnd() : trimmed}${suffix}`;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function parseTemperatureMillis(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return Math.round(parsed * 1000);
}

function parseOutputBytes(raw: string): number {
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN;
}

/**
 * Mirrors the bounds `skriuw-domain` enforces on a stored prompt. The backend
 * flattens every rejection into one opaque validation error, so the actionable
 * message has to come from here.
 */
export function promptDraftError(draft: PromptDraft): string | null {
  if (draft.name.trim().length === 0) {
    return "Give the prompt a name.";
  }
  if (byteLength(draft.name) > MAX_PROMPT_NAME_BYTES) {
    return `The name is longer than ${MAX_PROMPT_NAME_BYTES} bytes.`;
  }
  if (draft.systemPrompt.trim().length === 0) {
    return "Write the system prompt.";
  }
  const systemBytes = byteLength(draft.systemPrompt);
  if (systemBytes > MAX_PROMPT_SYSTEM_BYTES) {
    return `The system prompt is ${systemBytes.toLocaleString()} bytes; the limit is ${MAX_PROMPT_SYSTEM_BYTES.toLocaleString()} bytes.`;
  }
  const temperature = parseTemperatureMillis(draft.temperature);
  if (
    temperature !== null &&
    (Number.isNaN(temperature) ||
      temperature < 0 ||
      temperature > MAX_PROMPT_TEMPERATURE_MILLIS)
  ) {
    return "Temperature must be between 0 and 1.";
  }
  const maxOutputBytes = parseOutputBytes(draft.maxOutputBytes);
  if (
    Number.isNaN(maxOutputBytes) ||
    maxOutputBytes < 1 ||
    maxOutputBytes > MAX_PROMPT_OUTPUT_BYTES
  ) {
    return `Max output bytes must be between 1 and ${MAX_PROMPT_OUTPUT_BYTES.toLocaleString()}.`;
  }
  return null;
}

export function promptFromDraft(draft: PromptDraft, at: number): WorkspacePrompt {
  return {
    id: draft.id,
    name: draft.name.trim(),
    systemPrompt: draft.systemPrompt.trim(),
    inputShape: draft.inputShape,
    parameters: {
      temperatureMillis: parseTemperatureMillis(draft.temperature),
      maxOutputBytes: parseOutputBytes(draft.maxOutputBytes),
    },
    builtInId: draft.builtInId,
    createdAt: draft.createdAt,
    updatedAt: at,
  };
}
