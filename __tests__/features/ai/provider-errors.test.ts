import { describe, expect, test } from "bun:test";
import { classifyAiProviderError } from "@/domain/ai/provider-errors";

describe("classifyAiProviderError", () => {
	test("classifies Gemini invalid API key responses as invalid_key", () => {
		const err = Object.assign(new Error("API key not valid. Please pass a valid API key."), {
			statusCode: 400,
			responseBody: JSON.stringify({
				error: {
					code: 400,
					message: "API key not valid. Please pass a valid API key.",
					status: "INVALID_ARGUMENT",
					details: [{ reason: "API_KEY_INVALID" }],
				},
			}),
		});

		const classified = classifyAiProviderError(err, "google");

		expect(classified.code).toBe("invalid_key");
		expect(classified.message).toContain("rejected the selected API key");
		expect(classified.details).toContain("API key not valid");
	});

	test("surfaces provider message for unknown Gemini failures", () => {
		const err = Object.assign(new Error("Something odd happened"), {
			statusCode: 500,
		});

		const classified = classifyAiProviderError(err, "google");

		expect(classified.code).toBe("provider_error");
		expect(classified.message).toBe("Something odd happened");
	});

	test("classifies rate limit responses", () => {
		const err = Object.assign(new Error("Rate limit exceeded"), {
			statusCode: 429,
		});

		const classified = classifyAiProviderError(err, "groq");

		expect(classified.code).toBe("rate_limited");
		expect(classified.status).toBe(429);
	});
});
