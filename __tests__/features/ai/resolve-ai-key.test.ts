import { describe, expect, test } from "bun:test";
import { resolveAiKey } from "@/features/ai/lib/resolve-ai-key";
import type { AiProviderKeySummary } from "@/domain/ai/types";

const serverKey: AiProviderKeySummary = {
	id: "server-1",
	provider: "google",
	label: "Personal Gemini",
	keyPreview: "AIza•••",
	status: "valid",
	lastTestedAt: null,
	lastUsedAt: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("resolveAiKey", () => {
	test("prefers local keys over saved server keys", () => {
		const resolved = resolveAiKey({
			model: "google.gemini-2.5-flash",
			localKeys: [{ id: "local-1", name: "Browser key", apiKey: "local-key", tested: true }],
			activeLocalKeyId: "local-1",
			serverKeys: [serverKey],
		});

		expect(resolved).toEqual({
			source: "local",
			id: "local-1",
			label: "Browser key",
			apiKey: "local-key",
		});
	});

	test("uses saved server key when no local keys exist", () => {
		const resolved = resolveAiKey({
			model: "google.gemini-2.5-flash",
			localKeys: [],
			activeLocalKeyId: null,
			serverKeys: [serverKey],
		});

		expect(resolved).toEqual({
			source: "server",
			id: "server-1",
			label: "Personal Gemini",
			keyId: "server-1",
		});
	});

	test("matches server key provider to selected model", () => {
		const resolved = resolveAiKey({
			model: "groq.llama-3.3-70b-versatile",
			localKeys: [],
			activeLocalKeyId: null,
			serverKeys: [serverKey],
		});

		expect(resolved).toBeNull();
	});
});
