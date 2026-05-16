import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { DEFAULT_AI_MODEL, getProviderFromModelId, isAiModelId, type AiModelId } from "@/features/ai/constants";
import type { AiProvider } from "@/features/ai/types";
import { recordAiError, type AiErrorSource } from "@/features/ai/telemetry";
import { recordAiUsage } from "@/features/ai/usage";

function classifyProviderError(err: unknown, provider: AiProvider): {
  code: string;
  source: AiErrorSource;
  message: string;
  details: string;
  status: number;
  providerStatus?: number | null;
  providerMessage?: string | null;
} {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const providerStatus = (err as { status?: number }).status ?? null;
  const rawMessage = err instanceof Error ? err.message : String(err);
  const providerLabel = provider === "google" ? "Gemini" : provider === "groq" ? "Groq" : provider;

  if (providerStatus === 401 || msg.includes("api_key_invalid") || msg.includes("unauthenticated") || msg.includes("invalid_api_key") || msg.includes("invalid x-api-key")) {
    return {
      code: "invalid_key",
      source: "provider",
      message: `${providerLabel} rejected this API key.`,
      details: "Check that the key was copied correctly and belongs to an enabled project.",
      status: 401,
      providerStatus,
      providerMessage: rawMessage,
    };
  }
  if (providerStatus === 429 || msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("rate_limit") || msg.includes("rate limit")) {
    return {
      code: "rate_limited",
      source: "rate_limit",
      message: `This ${providerLabel} key is rate limited or out of quota.`,
      details: "The key is syntactically valid, but the provider will not serve requests right now.",
      status: 429,
      providerStatus,
      providerMessage: rawMessage,
    };
  }
  if (providerStatus === 403 || msg.includes("permission_denied") || msg.includes("forbidden")) {
    return {
      code: "forbidden",
      source: "provider",
      message: `This key is not allowed to use the selected model on ${providerLabel}.`,
      details: "Check API key restrictions, billing, and model access.",
      status: 403,
      providerStatus,
      providerMessage: rawMessage,
    };
  }
  if (providerStatus === 404 || msg.includes("not_found") || msg.includes("not found") || msg.includes("model_not_found")) {
    return {
      code: "model_not_found",
      source: "provider",
      message: `${providerLabel} could not find the selected model.`,
      details: "Choose another supported model in Settings -> AI.",
      status: 404,
      providerStatus,
      providerMessage: rawMessage,
    };
  }

  return {
    code: "provider_error",
    source: "provider",
    message: `Could not validate the key with ${providerLabel}.`,
    details: `${providerLabel} returned an unexpected response while checking model access.`,
    status: 502,
    providerStatus,
    providerMessage: rawMessage,
  };
}

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
  const { user } = await getAuthenticatedUser().catch(() => ({ user: null }));
  if (!user) {
    return testKeyErrorResponse({
      req,
      user,
      code: "authentication_required",
      source: "auth",
      message: "Sign in before testing AI keys.",
      details: "Key tests are account-scoped so diagnostics can be attached to the right user.",
      status: 401,
    });
  }

  const body = (await req.json().catch(() => ({}))) as { apiKey?: string; model?: string };
  const apiKey = body.apiKey?.trim();
  const model: AiModelId = isAiModelId(body.model) ? body.model : DEFAULT_AI_MODEL;
  const provider = getProviderFromModelId(model) ?? "google";

  if (!apiKey) {
    const providerLabel = provider === "google" ? "Gemini" : provider === "groq" ? "Groq" : provider;
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
      provider === "google"
        ? createGoogleGenerativeAI({ apiKey })
        : createGroq({ apiKey });

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
    const classified = classifyProviderError(err, provider);
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
      ...classified,
    });
  }
}