import crypto from "node:crypto";

export const MAX_LABEL_LENGTH = 60;
export const MIN_KEY_LENGTH = 20;

function getEncryptionKey(): Buffer {
  const secret = process.env.AI_KEYS_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("AI_KEYS_ENCRYPTION_SECRET is required to store AI provider keys");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptApiKey(encrypted: string): string {
  const [ivRaw, tagRaw, ciphertextRaw] = encrypted.split(".");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Invalid encrypted key payload");

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function fingerprintApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function previewApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 12) return "••••";
  return `${trimmed.slice(0, 8)}••••${trimmed.slice(-4)}`;
}

export function normalizeLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Key label is required");
  return trimmed.slice(0, MAX_LABEL_LENGTH);
}

export function normalizeApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length < MIN_KEY_LENGTH) throw new Error("API key is too short");
  if (/\s/.test(trimmed)) throw new Error("API key cannot contain whitespace");
  return trimmed;
}
