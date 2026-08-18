import type { AiRunRecord, AiRunState, AiUsageAggregate } from "@/contracts/ai";

export type UsagePeriod = "7d" | "30d" | "all";

export const USAGE_PERIODS: readonly { value: UsagePeriod; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const DAY_MS = 86_400_000;

export function usagePeriodStart(period: UsagePeriod, nowMs: number): number {
  if (period === "all") {
    return 0;
  }
  const days = period === "7d" ? 7 : 30;
  return Math.max(0, nowMs - days * DAY_MS);
}

export type UsageTotals = {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  estimated: boolean;
};

/**
 * Rolls the per-day, per-model buckets the backend derived into one headline
 * figure. `estimated` stays sticky: a single approximate bucket makes the
 * whole total approximate, and the surface must say so.
 */
export function usageTotals(aggregates: readonly AiUsageAggregate[]): UsageTotals {
  return aggregates.reduce<UsageTotals>(
    (totals, bucket) => ({
      runs: totals.runs + bucket.runs,
      inputTokens: totals.inputTokens + bucket.inputTokens,
      outputTokens: totals.outputTokens + bucket.outputTokens,
      costMicros: totals.costMicros + bucket.costMicros,
      estimated: totals.estimated || bucket.estimated,
    }),
    { runs: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, estimated: false },
  );
}

export type UsageModelRow = {
  key: string;
  providerId: string;
  modelId: string;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  estimated: boolean;
};

export function usageByModel(aggregates: readonly AiUsageAggregate[]): UsageModelRow[] {
  const rows = new Map<string, UsageModelRow>();
  for (const bucket of aggregates) {
    const key = `${bucket.providerId}/${bucket.modelId}`;
    const current = rows.get(key);
    rows.set(key, {
      key,
      providerId: bucket.providerId,
      modelId: bucket.modelId,
      runs: (current?.runs ?? 0) + bucket.runs,
      inputTokens: (current?.inputTokens ?? 0) + bucket.inputTokens,
      outputTokens: (current?.outputTokens ?? 0) + bucket.outputTokens,
      costMicros: (current?.costMicros ?? 0) + bucket.costMicros,
      estimated: (current?.estimated ?? false) || bucket.estimated,
    });
  }
  return [...rows.values()].sort((left, right) => right.costMicros - left.costMicros);
}

/**
 * Micro-dollars rendered as money. Anything non-zero below a tenth of a cent
 * reads as "< $0.001" rather than rounding away a real charge.
 */
export function formatCostMicros(costMicros: number): string {
  if (costMicros <= 0) {
    return "$0.00";
  }
  const dollars = costMicros / 1_000_000;
  if (dollars < 0.001) {
    return "< $0.001";
  }
  if (dollars < 1) {
    return `$${dollars.toFixed(3)}`;
  }
  return `$${dollars.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

const STATE_LABELS: Record<AiRunState, string> = {
  done: "Done",
  cancelled: "Cancelled",
  timed_out: "Timed out",
  failed: "Failed",
};

export function runStateLabel(state: AiRunState): string {
  return STATE_LABELS[state];
}

/**
 * The one sentence that keeps an estimate from reading as an exact count.
 * Every token or cost figure derived from estimated counts must carry it.
 */
export function tokenSourceNote(estimated: boolean): string | null {
  return estimated ? "Estimated — this provider reported no token counts." : null;
}

export function runTokenSummary(run: AiRunRecord): string {
  const counts = `${formatTokens(run.tokens.inputTokens)} in / ${formatTokens(run.tokens.outputTokens)} out`;
  return run.tokens.source === "estimated" ? `~${counts}` : counts;
}

export type RunFilterOption = {
  value: string;
  label: string;
};

const FILTER_SEPARATOR = "\u001f";

export function encodeModelFilter(providerId: string, modelId: string): string {
  return `${providerId}${FILTER_SEPARATOR}${modelId}`;
}

export function decodeModelFilter(
  value: string,
): { providerId: string; modelId: string } | null {
  const index = value.indexOf(FILTER_SEPARATOR);
  if (index <= 0) {
    return null;
  }
  return { providerId: value.slice(0, index), modelId: value.slice(index + 1) };
}

/** Provider and model choices offered by the run filter, drawn from what the history actually holds. */
export function runFilterOptions(aggregates: readonly AiUsageAggregate[]): {
  providers: RunFilterOption[];
  models: RunFilterOption[];
} {
  const providers = new Map<string, RunFilterOption>();
  const models = new Map<string, RunFilterOption>();
  for (const bucket of aggregates) {
    providers.set(bucket.providerId, { value: bucket.providerId, label: bucket.providerId });
    const value = encodeModelFilter(bucket.providerId, bucket.modelId);
    models.set(value, { value, label: `${bucket.providerId} · ${bucket.modelId}` });
  }
  return {
    providers: [...providers.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    ),
    models: [...models.values()].sort((left, right) => left.label.localeCompare(right.label)),
  };
}

export function formatRunTimestamp(startedAtMs: number): string {
  return new Date(startedAtMs).toLocaleString();
}
