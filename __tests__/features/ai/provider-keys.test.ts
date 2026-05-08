import { afterEach, describe, expect, test } from "bun:test";
import {
  decryptApiKey,
  encryptApiKey,
  fingerprintApiKey,
  MAX_LABEL_LENGTH,
  MIN_KEY_LENGTH,
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

    const maxLengthLabel = "x".repeat(MAX_LABEL_LENGTH);
    expect(normalizeLabel(maxLengthLabel)).toBe(maxLengthLabel);
    expect(normalizeLabel(`${maxLengthLabel}extra`)).toBe(maxLengthLabel);

    const minLengthKey = "k".repeat(MIN_KEY_LENGTH);
    expect(normalizeApiKey(minLengthKey)).toBe(minLengthKey);
    expect(() => normalizeApiKey("k".repeat(MIN_KEY_LENGTH - 1))).toThrow(
      "API key is too short",
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

  test("rejects malformed encrypted payloads", () => {
    process.env.AI_KEYS_ENCRYPTION_SECRET = "test-secret-for-ai-provider-keys";

    expect(() => decryptApiKey("not-a-valid-payload")).toThrow();
    expect(() => decryptApiKey("one.two")).toThrow();
    expect(() => decryptApiKey("not-base64.also-not-base64.still-not-base64")).toThrow();
  });

  test("requires a stable dedicated encryption secret", () => {
    const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-should-not-be-used";
    process.env.AI_KEYS_ENCRYPTION_SECRET = undefined;
    expect(() => encryptApiKey("k".repeat(MIN_KEY_LENGTH))).toThrow(
      "AI_KEYS_ENCRYPTION_SECRET is required",
    );

    process.env.AI_KEYS_ENCRYPTION_SECRET = "secret-one";
    const encrypted = encryptApiKey("k".repeat(MIN_KEY_LENGTH));
    process.env.AI_KEYS_ENCRYPTION_SECRET = "secret-two";
    expect(() => decryptApiKey(encrypted)).toThrow();
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;
  });
});
