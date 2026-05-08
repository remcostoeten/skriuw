import type { AiUsageLogRow } from "@/features/ai/types";

const HUMAN_ACTIONS: Record<string, string> = {
  generateTitle: "Triggered generate title",
  spellCheck: "Triggered spell check",
  continueWriting: "Triggered continue writing",
  testKey: "Tested AI provider key",
};

export function resolveAiHumanAction(action: string): string {
  return HUMAN_ACTIONS[action] ?? action;
}

export function readUsageMetadata(response: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  metadata: Record<string, unknown>;
} {
  const usage = (response as { usageMetadata?: Record<string, unknown> })?.usageMetadata ?? {};
  const inputTokens = typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : null;
  const outputTokens =
    typeof usage.candidatesTokenCount === "number" ? usage.candidatesTokenCount : null;
  const totalTokens = typeof usage.totalTokenCount === "number" ? usage.totalTokenCount : null;
  return { inputTokens, outputTokens, totalTokens, metadata: { usageMetadata: usage } };
}

export function mapUsageRow(row: {
  id: string;
  user_id: string | null;
  provider: string;
  model: string | null;
  action: string;
  human_action: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_url: string | null;
  prompt: string | null;
  status: "success" | "error";
  error_message: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  key_source: AiUsageLogRow["keySource"];
  metadata: Record<string, unknown> | null;
  created_at: string;
}): AiUsageLogRow {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    model: row.model,
    action: row.action,
    humanAction: row.human_action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceUrl: row.resource_url,
    prompt: row.prompt,
    status: row.status,
    errorMessage: row.error_message,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    keySource: row.key_source,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}
