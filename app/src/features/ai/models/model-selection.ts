import type { WorkspaceSettings } from "@/contracts/workspace";

export const OLLAMA_PROVIDER_ID = "ollama";
export const OLLAMA_PROVIDER_LABEL = "Ollama";

export type AiModelSelection = {
  providerId: string;
  modelId: string;
};

export function parseAiModelSelection(value: unknown): AiModelSelection | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<AiModelSelection>;
  if (typeof candidate.providerId !== "string" || candidate.providerId.length === 0) {
    return null;
  }
  if (typeof candidate.modelId !== "string" || candidate.modelId.length === 0) {
    return null;
  }
  return { providerId: candidate.providerId, modelId: candidate.modelId };
}

export function selectRawAiModelSetting(state: {
  settings: WorkspaceSettings;
}): unknown {
  return state.settings["aiModel"];
}

export function readAiModelSelection(
  settings: WorkspaceSettings,
): AiModelSelection | null {
  return parseAiModelSelection(settings["aiModel"]);
}

export function changeAiModelSelection(
  settings: WorkspaceSettings,
  selection: AiModelSelection | null,
): WorkspaceSettings {
  if (selection === null) {
    if (!("aiModel" in settings)) {
      return settings;
    }
    const { aiModel: _removed, ...remaining } = settings;
    return remaining;
  }
  return {
    ...settings,
    aiModel: { providerId: selection.providerId, modelId: selection.modelId },
  };
}

export function sameAiModel(
  a: AiModelSelection | null,
  b: AiModelSelection | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.providerId === b.providerId && a.modelId === b.modelId;
}

/**
 * Resolves the model for one request at construction time. An explicit
 * override wins without ever touching the stored default, and the result is
 * captured by value into the request, so changing the default mid-stream
 * cannot retarget a completion that already started.
 */
export function resolveAiModel(
  override: AiModelSelection | null,
  settings: WorkspaceSettings,
): AiModelSelection | null {
  return override ?? readAiModelSelection(settings);
}
