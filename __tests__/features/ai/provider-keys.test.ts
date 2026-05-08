import { afterEach, describe, expect, test } from "bun:test";
import {
  decryptApiKey,
  encryptApiKey,
  fingerprintApiKey,
  normalizeApiKey,
  normalizeLabel,
  previewApiKey,
} from "@/features/ai/key-utils";

const originalSecret = process.env.AI_KEYS_ENCRYPTION_SECRET;

afterEach(() => {
  process.env.AI_KEYS_ENCRYPTION_SECRET = originalSecret;
});

describe("AI provider key helpers", () => {
  test("normalizes key labels and key material", () => {
    expect(normalizeLabel("  Personal   Gemini  ")).toBe("Personal Gemini");
    expect(() => normalizeLabel("   ")).toThrow("Key label is required");

    expect(normalizeApiKey("  abcdefghijklmnopqrstuvwxyz  ")).toBe("abcdefghijklmnopqrstuvwxyz");
    expect(() => normalizeApiKey("too short")).toThrow("API key is too short");
    expect(() => normalizeApiKey("abc defghijklmnopqrstuvwxyz")).toThrow(
      "API key cannot contain whitespace",
    );
  });

  test("redacts preview and fingerprints keys consistently", () => {
    expect(previewApiKey("12345678901234567890")).toBe("12345678••••7890");
    expect(fingerprintApiKey("example-key")).toHaveLength(64);
  });

  test("encrypts and decrypts with configured secret", () => {
    process.env.AI_KEYS_ENCRYPTION_SECRET = "test-secret-for-ai-provider-keys";
    const plaintext = "gemini-secret-key";
    const encrypted = encryptApiKey(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });
});
