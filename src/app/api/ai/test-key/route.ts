import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { DEFAULT_AI_MODEL, isAiModelId, type AiModelId } from "@/features/ai/constants";
import { recordAiError, type AiErrorSource } from "@/features/ai/telemetry";

function classifyGeminiError(err: unknown): {
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

  if (providerStatus === 401 || msg.includes("api_key_invalid") || msg.includes("unauthenticated")) {
    return {
      code: "invalid_key",
      source: "provider",
      message: "Gemini rejected this API key.",
      details: "Check that the key was copied correctly and belongs to an enabled Gemini project.",
      status: 401,
      providerStatus,
      providerMessage: rawMessage,
    };
  }
  if (providerStatus === 429 || msg.includes("resource_exhausted") || msg.includes("quota")) {
    return {
      code: "rate_limited",
      source: "rate_limit",
      message: "This key is rate limited or out of quota.",
      details: "The key is syntactically valid, but Gemini will not serve requests right now.",
      status: 429,
      providerStatus,
      providerMessage: rawMessage,
    };
  }
  if (providerStatus === 403 || msg.includes("permission_denied")) {
    return {
      code: "forbidden",
      source: "provider",
      message: "This key is not allowed to use the selected model.",
      details: "Check API key restrictions, billing, and Gemini model access for the project.",
      status: 403,
      providerStatus,
      providerMessage: rawMessage,
    };
  }
  if (providerStatus === 404 || msg.includes("not_found") || msg.includes("not found")) {
    return {
      code: "model_not_found",
      source: "provider",
      message: "Gemini could not find the selected model.",
      details: "Choose another supported model in Settings -> AI.",
      status: 404,
      providerStatus,
      providerMessage: rawMessage,
    };
  }

  return {
    code: "provider_error",
    source: "provider",
    message: "Could not validate the key with Gemini.",
    details: "Gemini returned an unexpected response while checking model access.",
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
      message: "Sign in before testing Gemini keys.",
      details: "Key tests are account-scoped so diagnostics can be attached to the right user.",
      status: 401,
    });
  }

  const body = (await req.json().catch(() => ({}))) as { apiKey?: string; model?: string };
  const apiKey = body.apiKey?.trim();
  const model: AiModelId = isAiModelId(body.model) ? body.model : DEFAULT_AI_MODEL;

  if (!apiKey) {
    return testKeyErrorResponse({
      req,
      user,
      apiKey,
      model,
      code: "no_key",
      source: "validation",
      message: "No Gemini API key was provided.",
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
      details: "Open Settings -> AI and choose one of the supported Gemini models.",
      status: 400,
    });
  }

  // Validate key + model by listing the model — no generation quota consumed
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${encodeURIComponent(apiKey)}`,
      { method: "GET" },
    );

    if (res.ok) {
      return NextResponse.json({ ok: true });
    }

    // Synthesize an error to run through the classifier
    const data = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } };
    const errMsg = data.error?.status ?? data.error?.message ?? res.statusText;
    const synthetic = Object.assign(new Error(errMsg), { status: res.status });
    return testKeyErrorResponse({
      req,
      user,
      apiKey,
      model,
      ...classifyGeminiError(synthetic),
    });
  } catch (err) {
    console.error("[AI/test-key]", err);
    return testKeyErrorResponse({
      req,
      user,
      apiKey,
      model,
      ...classifyGeminiError(err),
    });
  }
}
