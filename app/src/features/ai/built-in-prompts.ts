import generated from "../../../../contracts/generated/built-in-prompts.json";
import type { PromptInputShape, PromptParameters } from "@/contracts/workspace";

export type BuiltInPrompt = {
  id: string;
  name: string;
  systemPrompt: string;
  inputShape: PromptInputShape;
  parameters: PromptParameters;
};

type BuiltInPromptLibrary = {
  version: number;
  prompts: readonly BuiltInPrompt[];
};

const library = generated as BuiltInPromptLibrary;

export const BUILT_IN_PROMPT_LIBRARY_VERSION = library.version;

/**
 * The shipped prompt library, generated from `skriuw-domain` so the renderer
 * and the backend never describe two different sets of built-ins. Order is the
 * order these appear in every picker.
 */
export const BUILT_IN_PROMPTS: readonly BuiltInPrompt[] = library.prompts;

export function builtInPrompt(id: string): BuiltInPrompt | null {
  return BUILT_IN_PROMPTS.find((prompt) => prompt.id === id) ?? null;
}
