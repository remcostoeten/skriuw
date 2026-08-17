import type { LocalAiModel } from "@/contracts/ai";
import { noop } from "@/shared/lib/noop";

const STORAGE_KEY = "skriuw:v2:ai:ollama-model";
const MAX_MODEL_NAME_LENGTH = 256;

export function readSelectedOllamaModel(storage?: Storage): string | null {
  try {
    const value = (storage ?? globalThis.localStorage).getItem(STORAGE_KEY);
    return value && value.length <= MAX_MODEL_NAME_LENGTH ? value : null;
  } catch {
    noop();
    return null;
  }
}

export function writeSelectedOllamaModel(model: string | null, storage?: Storage): void {
  try {
    const area = storage ?? globalThis.localStorage;
    if (model === null) {
      area.removeItem(STORAGE_KEY);
    } else if (model.length <= MAX_MODEL_NAME_LENGTH) {
      area.setItem(STORAGE_KEY, model);
    }
  } catch {
    noop();
  }
}

export function availableOllamaSelection(
  selected: string | null,
  models: readonly LocalAiModel[],
): string | null {
  return selected && models.some((model) => model.name === selected)
    ? selected
    : models[0]?.name ?? null;
}
