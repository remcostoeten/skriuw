import type { AiModelSelection } from "@/features/ai/models/model-selection";

type Props = {
  selection: AiModelSelection;
  systemPrompt: string;
  userPrompt: string;
};

let staged: Props | null = null;

/**
 * Hands one recorded run to the playground across a route change. The value
 * is consumed exactly once so a later visit opens an empty playground instead
 * of silently replaying an old prompt.
 */
export function stagePlaygroundPrefill(prefill: Props): void {
  staged = prefill;
}

export function takePlaygroundPrefill(): Props | null {
  const value = staged;
  staged = null;
  return value;
}
