import assert from "node:assert/strict";
import test from "node:test";
import {
  availableOllamaSelection,
  readSelectedOllamaModel,
  writeSelectedOllamaModel,
} from "../../../src/features/ai/ollama-selection";

function model(name: string) {
  return {
    name,
    sizeBytes: 1,
    modifiedAt: "2026-08-17T00:00:00Z",
    digest: name.padEnd(64, "a").slice(0, 64),
  };
}

test("selected Ollama model is device-local and survives the settings surface", () => {
  const storage = new MemoryStorage();
  writeSelectedOllamaModel("gemma3:4b", storage);
  assert.equal(readSelectedOllamaModel(storage), "gemma3:4b");
});

test("selection falls back when the installed model disappears", () => {
  assert.equal(
    availableOllamaSelection("removed:latest", [model("gemma3:4b")]),
    "gemma3:4b",
  );
  assert.equal(availableOllamaSelection("removed:latest", []), null);
});

test("clearing the selection removes it rather than storing an empty model name", () => {
  const storage = new MemoryStorage();
  writeSelectedOllamaModel("gemma3:4b", storage);
  writeSelectedOllamaModel(null, storage);
  assert.equal(storage.length, 0);
  assert.equal(readSelectedOllamaModel(storage), null);
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
