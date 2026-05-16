import type { AiUsageLogRow } from "@/features/ai/types";

const HUMAN_ACTIONS: Record<string, string> = {
  generateTitle: "Triggered generate title",
  spellCheck: "Triggered spell check",
  continueWriting: "Triggered continue writing",
  testKey: "Tested AI provider key",
};

export function normalizeAiUsagePagination({
  limit,
  offset,
}: {
  limit: number;
  offset: number;
}): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 50),
    offset: Math.max(Number.isFinite(offset) ? offset : 0, 0),
  };
}

export function resolveAiHumanAction(action: string): string {
  return HUMAN_ACTIONS[action] ?? action;
}

export function readUsageMetadata(response: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  metadata: Record<string, unknown>;
} {
  if (!response || typeof response !== "object") {
    return { inputTokens: null, outputTokens: null, totalTokens: null, metadata: {} };
  }

  const r = response as Record<string, unknown>;
  const usage = r.usage as Record<string, unknown> | undefined;

  if (usage) {
    const inputTokens = typeof usage.promptTokens === "number" ? usage.promptTokens : null;
    const outputTokens = typeof usage.completionTokens === "number" ? usage.completionTokens : null;
    const totalTokens =
      inputTokens !== null && outputTokens !== null
        ? inputTokens + outputTokens
        : typeof usage.totalTokens === "number"
          ? usage.totalTokens
          : null;

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      metadata: { usage },
    };
  }

  const usageMetadata = r.usageMetadata as Record<string, unknown> | undefined;
  if (usageMetadata) {
    const inputTokens = typeof usageMetadata.promptTokenCount === "number" ? usageMetadata.promptTokenCount : null;
    const outputTokens =
      typeof usageMetadata.candidatesTokenCount === "number" ? usageMetadata.candidatesTokenCount : null;
    const totalTokens = typeof usageMetadata.totalTokenCount === "number" ? usageMetadata.totalTokenCount : null;
    return { inputTokens, outputTokens, totalTokens, metadata: { usageMetadata } };
  }

  return { inputTokens: null, outputTokens: null, totalTokens: null, metadata: {} };
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