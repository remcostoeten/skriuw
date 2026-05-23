import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import {
	DEFAULT_AI_MODEL,
	getProviderFromModelId,
	isAiModelId,
	type AiModelId,
} from "@/domain/ai/constants";
import { classifyAiProviderError } from "@/domain/ai/provider-errors";
import { recordAiError, type AiErrorSource } from "@/domain/ai/telemetry";
import { recordAiUsage } from "@/domain/ai/usage";

async function testKeyErrorResponse({
	req,
	user,
	apiKey,
	model,
	code,
	source,
	message,
	details,
	status,
	providerStatus,
	providerMessage,
}: {
	req: NextRequest;
	user?: { id: string; email?: string } | null;
	apiKey?: string | null;
	model?: string | null;
	code: string;
	source: AiErrorSource;
	message: string;
	details: string;
	status: number;
	providerStatus?: number | null;
	providerMessage?: string | null;
}) {
	const { eventId } = await recordAiError({
		endpoint: "/api/ai/test-key",
		action: "testKey",
		model,
		userId: user?.id,
		userEmail: user?.email,
		apiKey,
		code,
		source,
		message,
		status,
		providerStatus,
		providerMessage,
		userAgent: req.headers.get("user-agent"),
		requestContext: {
			hasUserApiKey: Boolean(apiKey?.trim()),
		},
	});

	return NextResponse.json({ code, error: code, message, details, eventId }, { status });
}

export async function POST(req: NextRequest) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) {
		return testKeyErrorResponse({
			req,
			user,
			code: "authentication_required",
			source: "auth",
			message: "Sign in before testing AI keys.",
			details:
				"Key tests are account-scoped so diagnostics can be attached to the right user.",
			status: 401,
		});
	}

	const body = (await req.json().catch(() => ({}))) as { apiKey?: string; model?: string };
	const apiKey = body.apiKey?.trim();
	const model: AiModelId = isAiModelId(body.model) ? body.model : DEFAULT_AI_MODEL;
	const provider = getProviderFromModelId(model) ?? "google";

	if (!apiKey) {
		const providerLabel =
			provider === "google" ? "Gemini" : provider === "groq" ? "Groq" : provider;
		return testKeyErrorResponse({
			req,
			user,
			apiKey,
			model,
			code: "no_key",
			source: "validation",
			message: `No ${providerLabel} API key was provided.`,
			details: "Paste a key before running the connection test.",
			status: 400,
		});
	}

	if (body.model && !isAiModelId(body.model)) {
		return testKeyErrorResponse({
			req,
			user,
			apiKey,
			model: body.model,
			code: "invalid_model",
			source: "validation",
			message: "The selected AI model is not supported.",
			details: "Open Settings -> AI and choose one of the supported models.",
			status: 400,
		});
	}

	const modelName = model.includes(".") ? model.split(".").slice(1).join(".") : model;

	try {
		const providerInstance =
			provider === "google" ? createGoogleGenerativeAI({ apiKey }) : createGroq({ apiKey });

		await generateText({
			model: providerInstance(modelName),
			prompt: "test",
			maxOutputTokens: 1,
		});

		await recordAiUsage({
			userId: user.id,
			model,
			action: "testKey",
			status: "success",
			keySource: "user_key",
		});
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[AI/test-key]", err);
		const classified = classifyAiProviderError(err, provider);
		await recordAiUsage({
			userId: user.id,
			model,
			action: "testKey",
			status: "error",
			errorMessage: classified.providerMessage ?? classified.message,
			keySource: "user_key",
			metadata: {
				providerStatus: classified.providerStatus ?? null,
				code: classified.code,
			},
		});
		return testKeyErrorResponse({
			req,
			user,
			apiKey,
			model,
			code: classified.code,
			source: classified.source as AiErrorSource,
			message: classified.message,
			details: classified.details,
			status: classified.status,
			providerStatus: classified.providerStatus,
			providerMessage: classified.providerMessage,
		});
	}
}
