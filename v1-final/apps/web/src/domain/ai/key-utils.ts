import crypto from "node:crypto";
import { decryptSecret, encryptSecret } from "@/shared/lib/secret-cipher";

export const MAX_LABEL_LENGTH = 60;
export const MIN_KEY_LENGTH = 20;

export function encryptApiKey(apiKey: string): string {
	return encryptSecret(apiKey, "AI_KEYS_ENCRYPTION_SECRET");
}

export function decryptApiKey(encrypted: string): string {
	return decryptSecret(encrypted, "AI_KEYS_ENCRYPTION_SECRET");
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
