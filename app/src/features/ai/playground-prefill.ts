import type { AiModelSelection } from "./model-selection";

export type PlaygroundPrefill = {
  selection: AiModelSelection;
  systemPrompt: string;
  userPrompt: string;
};

let staged: PlaygroundPrefill | null = null;

/**
 * Hands one recorded run to the playground across a route change. The value
 * is consumed exactly once so a later visit opens an empty playground instead
 * of silently replaying an old prompt.
 */
export function stagePlaygroundPrefill(prefill: PlaygroundPrefill): void {
  staged = prefill;
}

export function takePlaygroundPrefill(): PlaygroundPrefill | null {
  const value = staged;
  staged = null;
  return value;
}
