import type {
  AiCompletionEvent,
  AiCompletionRequest,
  AiProviderError,
  AiUsage,
} from "@/contracts/ai";
import type { AiModelInventory, AiModelOption, AiProviderGroup } from "./model-options";
import { aiModelGroups } from "./model-options";
import type { AiModelSelection } from "./model-selection";

export const MAX_PLAYGROUND_PROMPT_BYTES = 1_048_576;
export const MIN_OUTPUT_BYTES = 1;
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
export const DEFAULT_OUTPUT_BYTES = 256 * 1024;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_TEMPERATURE_MILLIS = 1_000;

export const FAKE_MODEL: AiModelSelection = { providerId: "fake", modelId: "fake" };

const FAKE_GROUP: AiProviderGroup = {
  providerId: FAKE_MODEL.providerId,
  label: "Offline",
  options: [
    {
      providerId: FAKE_MODEL.providerId,
      modelId: FAKE_MODEL.modelId,
      label: "Fake (offline demo)",
      detail: "Scripted response, no provider involved",
      available: true,
      disabledReason: null,
    },
  ],
};

/**
 * Provider groups the playground can actually fire at: every available model
 * from the shared inventory plus the always-available fake provider. A null
 * inventory (still loading, or the load failed) leaves the fake usable.
 */
export function playgroundModelGroups(inventory: AiModelInventory | null): AiProviderGroup[] {
  const groups: AiProviderGroup[] = [FAKE_GROUP];
  if (inventory === null) {
    return groups;
  }
  for (const group of aiModelGroups(inventory)) {
    const options = group.options.filter((option) => option.available);
    if (options.length > 0) {
      groups.push({ ...group, options });
    }
  }
  return groups;
}

export function playgroundOptionFor(
  groups: readonly AiProviderGroup[],
  selection: AiModelSelection | null,
): AiModelOption | null {
  if (selection === null) {
    return null;
  }
  for (const group of groups) {
    for (const option of group.options) {
      if (option.providerId === selection.providerId && option.modelId === selection.modelId) {
        return option;
      }
    }
  }
  return null;
}

export function defaultPlaygroundSelection(
  groups: readonly AiProviderGroup[],
  storedDefault: AiModelSelection | null,
): AiModelSelection {
  if (storedDefault === null || playgroundOptionFor(groups, storedDefault) === null) {
    return FAKE_MODEL;
  }
  return storedDefault;
}

export function promptByteSize(systemPrompt: string, userPrompt: string): number {
  const encoder = new TextEncoder();
  return encoder.encode(systemPrompt).length + encoder.encode(userPrompt).length;
}

/**
 * Mirrors the seam's prompt bound. The Rust layer flattens every validation
 * failure into one opaque start error, so the specific message has to come
 * from here for the rejection to be actionable.
 */
export function promptByteError(systemPrompt: string, userPrompt: string): string | null {
  const size = promptByteSize(systemPrompt, userPrompt);
  if (size <= MAX_PLAYGROUND_PROMPT_BYTES) {
    return null;
  }
  return `Prompt is ${size.toLocaleString()} bytes; the limit is ${MAX_PLAYGROUND_PROMPT_BYTES.toLocaleString()} bytes. Shorten it — it will not be truncated.`;
}

export function clampTemperatureMillis(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(MAX_TEMPERATURE_MILLIS, Math.max(0, Math.round(parsed * 1000)));
}

export function clampMaxOutputBytes(raw: string): number {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OUTPUT_BYTES;
  }
  return Math.min(MAX_OUTPUT_BYTES, Math.max(MIN_OUTPUT_BYTES, Math.round(parsed)));
}

export type PlaygroundDraft = {
  selection: AiModelSelection;
  systemPrompt: string;
  userPrompt: string;
  temperatureMillis: number | null;
  maxOutputBytes: number;
};

export function buildPlaygroundRequest(draft: PlaygroundDraft): AiCompletionRequest {
  return {
    requestId: crypto.randomUUID(),
    providerId: draft.selection.providerId,
    modelId: draft.selection.modelId,
    systemPrompt: draft.systemPrompt,
    userPrompt: draft.userPrompt,
    parameters: {
      maxOutputBytes: draft.maxOutputBytes,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retryCount: 0,
      temperatureMillis: draft.temperatureMillis,
      topPMillis: null,
    },
  };
}

export type PlaygroundRun =
  | { phase: "idle" }
  | { phase: "streaming"; requestId: string }
  | { phase: "done"; requestId: string; usage: AiUsage | null }
  | { phase: "cancelled"; requestId: string }
  | { phase: "timeout"; requestId: string }
  | { phase: "error"; requestId: string; error: AiProviderError };

export type PlaygroundTiming = {
  startedAt: number;
  firstDeltaAt: number | null;
  finishedAt: number | null;
};

export function terminalRun(
  event: Exclude<AiCompletionEvent, { type: "delta" }>,
): PlaygroundRun {
  if (event.type === "done") {
    return { phase: "done", requestId: event.requestId, usage: event.usage ?? null };
  }
  if (event.type === "cancelled") {
    return { phase: "cancelled", requestId: event.requestId };
  }
  if (event.type === "timeout") {
    return { phase: "timeout", requestId: event.requestId };
  }
  return { phase: "error", requestId: event.requestId, error: event.error };
}

export function startFailureRun(requestId: string, message: string): PlaygroundRun {
  return {
    phase: "error",
    requestId,
    error: {
      providerId: "playground",
      category: "internal_failure",
      message,
      recoveryAction: "none",
    },
  };
}

function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function tokensPerSecond(usage: AiUsage, timing: PlaygroundTiming): number | null {
  const streamedFrom = timing.firstDeltaAt ?? timing.startedAt;
  const elapsed = (timing.finishedAt ?? streamedFrom) - streamedFrom;
  if (elapsed <= 0 || usage.outputTokens <= 0) {
    return null;
  }
  return usage.outputTokens / (elapsed / 1000);
}

export function playgroundStatusLine(run: PlaygroundRun, timing: PlaygroundTiming): string {
  if (run.phase === "idle") {
    return "";
  }
  if (run.phase === "streaming") {
    return "Streaming…";
  }
  if (run.phase === "cancelled") {
    return "Cancelled";
  }
  if (run.phase === "timeout") {
    return "Timed out";
  }
  if (run.phase === "error") {
    return `Failed: ${run.error.message}`;
  }
  const duration = formatSeconds((timing.finishedAt ?? timing.startedAt) - timing.startedAt);
  if (run.usage === null) {
    return `Done · ${duration}`;
  }
  const rate = tokensPerSecond(run.usage, timing);
  const tokens = `${run.usage.inputTokens} in / ${run.usage.outputTokens} out tokens`;
  if (rate === null) {
    return `Done · ${duration} · ${tokens}`;
  }
  return `Done · ${duration} · ${tokens} · ${rate.toFixed(1)} tok/s`;
}
