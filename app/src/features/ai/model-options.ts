import type {
  LocalAiModel,
  LocalAiStatus,
  RemoteAiCatalog,
  RemoteAiProviderState,
} from "@/contracts/ai";
import { formatByteSize } from "@/shared/lib/format-bytes";
import { OLLAMA_MODEL_CATALOG } from "./ollama-model-catalog";
import {
  remoteAiCanComplete,
  remoteAiConsentIsCurrent,
  remoteAiModelSummary,
  remoteAiModelsFor,
} from "./remote-ai-model";
import {
  OLLAMA_PROVIDER_ID,
  OLLAMA_PROVIDER_LABEL,
  type AiModelSelection,
} from "./model-selection";

export type AiModelOption = {
  providerId: string;
  modelId: string;
  label: string;
  detail: string | null;
  available: boolean;
  disabledReason: string | null;
};

export type AiProviderGroup = {
  providerId: string;
  label: string;
  options: AiModelOption[];
};

export type AiModelInventory = {
  ollamaStatus: LocalAiStatus | null;
  ollamaModels: readonly LocalAiModel[];
  remoteProviders: readonly RemoteAiProviderState[];
  remoteCatalog: RemoteAiCatalog | null;
};

const OLLAMA_UNAVAILABLE_REASONS: Record<string, string> = {
  not_installed: "Ollama is not installed",
  installed_stopped: "Ollama is not running",
  starting: "Ollama is still starting",
  running: "",
  failed: "Ollama stopped unexpectedly",
  unsupported: "Ollama needs a manual install on this system",
};

function ollamaRuntimeReason(status: LocalAiStatus | null): string | null {
  if (status === null) {
    return "Checking Ollama…";
  }
  if (status.state === "running") {
    return null;
  }
  return OLLAMA_UNAVAILABLE_REASONS[status.state] ?? "Ollama is not available";
}

function installedModelDetail(model: LocalAiModel): string {
  return model.parameterSize
    ? `${formatByteSize(model.sizeBytes)} · ${model.parameterSize}`
    : formatByteSize(model.sizeBytes);
}

function ollamaGroup(
  status: LocalAiStatus | null,
  models: readonly LocalAiModel[],
): AiProviderGroup {
  const runtimeReason = ollamaRuntimeReason(status);
  const options: AiModelOption[] = models.map((model) => ({
    providerId: OLLAMA_PROVIDER_ID,
    modelId: model.name,
    label: model.name,
    detail: installedModelDetail(model),
    available: runtimeReason === null,
    disabledReason: runtimeReason,
  }));
  const installed = new Set(models.map((model) => model.name));
  for (const entry of OLLAMA_MODEL_CATALOG) {
    if (installed.has(entry.id)) {
      continue;
    }
    options.push({
      providerId: OLLAMA_PROVIDER_ID,
      modelId: entry.id,
      label: entry.label,
      detail: entry.approxSize,
      available: false,
      disabledReason: runtimeReason ?? "Not installed — pull it in AI settings",
    });
  }
  return { providerId: OLLAMA_PROVIDER_ID, label: OLLAMA_PROVIDER_LABEL, options };
}

function remoteProviderReason(provider: RemoteAiProviderState): string | null {
  if (!provider.keyTier) {
    return "No API key saved";
  }
  if (!remoteAiConsentIsCurrent(provider)) {
    return provider.acceptedDisclosureVersion == null
      ? "Disclosure not accepted"
      : "Disclosure changed since you accepted it";
  }
  return null;
}

function remoteGroup(
  provider: RemoteAiProviderState,
  catalog: RemoteAiCatalog | null,
): AiProviderGroup {
  const available = remoteAiCanComplete(provider);
  const reason = available ? null : remoteProviderReason(provider);
  const options = remoteAiModelsFor(catalog, provider.providerId).map((model) => ({
    providerId: provider.providerId,
    modelId: model.modelId,
    label: model.label,
    detail: remoteAiModelSummary(model),
    available,
    disabledReason: reason,
  }));
  return { providerId: provider.providerId, label: provider.label, options };
}

export function aiModelGroups(inventory: AiModelInventory): AiProviderGroup[] {
  const groups = [ollamaGroup(inventory.ollamaStatus, inventory.ollamaModels)];
  for (const provider of inventory.remoteProviders) {
    const group = remoteGroup(provider, inventory.remoteCatalog);
    if (group.options.length > 0) {
      groups.push(group);
    }
  }
  return groups;
}

export function anyAiModelAvailable(groups: readonly AiProviderGroup[]): boolean {
  return groups.some((group) => group.options.some((option) => option.available));
}

export function aiModelOptionFor(
  groups: readonly AiProviderGroup[],
  selection: AiModelSelection | null,
): AiModelOption | null {
  if (selection === null) {
    return null;
  }
  for (const group of groups) {
    for (const option of group.options) {
      if (
        option.providerId === selection.providerId &&
        option.modelId === selection.modelId
      ) {
        return option;
      }
    }
  }
  return null;
}

export function describeAiSelection(
  groups: readonly AiProviderGroup[],
  selection: AiModelSelection | null,
): string {
  if (selection === null) {
    return "No default model chosen";
  }
  const group = groups.find((candidate) => candidate.providerId === selection.providerId);
  const option = aiModelOptionFor(groups, selection);
  const providerLabel = group?.label ?? selection.providerId;
  const modelLabel = option?.label ?? selection.modelId;
  return `${providerLabel} · ${modelLabel}`;
}
