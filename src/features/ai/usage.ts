import { createSupabaseAdminClient } from "@/core/supabase/server-client";
import type { AiAction } from "@/features/ai/service";
import type { AiKeySource, AiUsageLogRow, AiUsageStatus } from "@/features/ai/types";
import {
  mapUsageRow,
  normalizeAiUsagePagination,
  resolveAiHumanAction,
} from "@/features/ai/usage-utils";

export type AiUsageInput = {
  userId?: string | null;
  provider?: string;
  model?: string | null;
  action: AiAction | "testKey" | string;
  humanAction?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceUrl?: string | null;
  prompt?: string | null;
  status: AiUsageStatus;
  errorMessage?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  keySource?: AiKeySource;
  metadata?: Record<string, unknown>;
};

export async function recordAiUsage(input: AiUsageInput): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("ai_usage_logs").insert({
      user_id: input.userId ?? null,
      provider: input.provider ?? "gemini",
      model: input.model ?? null,
      action: input.action,
      human_action: input.humanAction ?? resolveAiHumanAction(input.action),
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      resource_url: input.resourceUrl ?? null,
      prompt: input.prompt ?? null,
      status: input.status,
      error_message: input.errorMessage ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      total_tokens: input.totalTokens ?? null,
      key_source: input.keySource ?? "unknown",
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.error("[AI/usage] failed to persist", error.message);
    }
  } catch (error) {
    console.error("[AI/usage] unavailable", error);
  }
}

export async function listAiUsageLogs({
  userId,
  limit,
  offset,
}: {
  userId: string;
  limit: number;
  offset: number;
}): Promise<AiUsageLogRow[]> {
  const { limit: safeLimit, offset: safeOffset } = normalizeAiUsagePagination({ limit, offset });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ai_usage_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) throw error;
  return ((data ?? []) as Parameters<typeof mapUsageRow>[0][]).map(mapUsageRow);
}
