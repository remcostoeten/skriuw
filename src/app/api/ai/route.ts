import { GoogleGenAI } from "@google/genai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/supabase/server-client";
import {
  DEFAULT_AI_MODEL,
  MAX_AI_CONTENT_CHARS,
  isAiModelId,
  type AiModelId,
} from "@/features/ai/constants";
import type { AiAction } from "@/features/ai/service";
import { getDecryptedAiProviderKey } from "@/features/ai/provider-keys";
import { recordAiError, type AiErrorSource } from "@/features/ai/telemetry";
import { recordAiUsage } from "@/features/ai/usage";
import { readUsageMetadata } from "@/features/ai/usage-utils";
import type { AiKeySource } from "@/features/ai/types";

const SERVER_GEMINI_KEY = process.env.GEMINI_API_KEY;
const serverGenai = SERVER_GEMINI_KEY ? new GoogleGenAI({ apiKey: SERVER_GEMINI_KEY }) : null;

const ACTION_DEFAULTS: Record<AiAction, string> = {
  generateTitle: DEFAULT_AI_MODEL,
  spellCheck: DEFAULT_AI_MODEL,
  continueWriting: "gemini-2.5-pro",
};

const PROMPTS: Record<AiAction, (content: string) => string> = {
  generateTitle: (content) =>
    `Generate a short, concise title (max 6 words) for this document. Respond ONLY with the title text, no markdown, no quotes.\n\n${content}`,
  spellCheck: (content) =>
    `Act as a professional copy editor. Correct all spelling, grammar, and typography errors in the following Markdown document. Keep the structural formatting (headings, lists, bolding) exactly the same. Only fix the text inside it. Respond ONLY with the corrected markdown document, without any extra commentary.\n\n${content}`,
  continueWriting: (content) =>
    `Continue writing the following Markdown document. Preserve its tone, style, and formatting. Output ONLY the continuation text in Markdown, do NOT repeat the original text.\n\n${content}`,
};

const VALID_ACTIONS = new Set(Object.keys(PROMPTS));

type UserContext = Awaited<ReturnType<typeof getAuthenticatedUser>>["user"] | null;

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function classifyGeminiGenerationError(err: unknown): {
  code: string;
  source: AiErrorSource;
  message: string;
  details: string;
  status: number;
  providerStatus?: number | null;
  providerMessage?: string | null;
} {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const msg = rawMessage.toLowerCase();
  const providerStatus = (err as { status?: number }).status ?? null;

  if (providerStatus === 429 || msg.includes("resource_exhausted") || msg.includes("quota")) {
    return {
      code: "rate_limited",
      source: "rate_limit",
      message: "The selected Gemini key is rate limited or out of quota.",
      details: "Choose another saved key or wait for the provider quota window to reset.",
      status: 429,
      providerStatus,
      providerMessage: rawMessage,
    };
  }

  if (providerStatus === 401 || msg.includes("api_key_invalid") || msg.includes("unauthenticated")) {
    return {
      code: "invalid_key",
      source: "provider",
      message: "Gemini rejected the selected API key.",
      details: "Re-test the key in Settings -> AI or replace it with a valid key.",
      status: 401,
      providerStatus,
      providerMessage: rawMessage,
    };
  }

  if (providerStatus === 403 || msg.includes("permission_denied")) {
    return {
      code: "forbidden",
      source: "provider",
      message: "Gemini denied access for the selected key or model.",
      details: "Check API key restrictions and whether the selected Gemini model is enabled.",
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
      details: "Switch to a supported model in Settings -> AI.",
      status: 404,
      providerStatus,
      providerMessage: rawMessage,
    };
  }

  return {
    code: "provider_error",
    source: "provider",
    message: "Gemini returned an unexpected error.",
    details: "The provider request failed. The diagnostic event includes the provider status and message.",
    status: 502,
    providerStatus,
    providerMessage: rawMessage,
  };
}

async function aiErrorResponse({
  req,
  user,
  action,
  model,
  apiKey,
  resourceType,
  resourceId,
  resourceUrl,
  prompt,
  keySource,
  skipUsageLog,
  code,
  source,
  message,
  details,
  status,
  providerStatus,
  providerMessage,
  contentLength,
}: {
  req: NextRequest;
  user?: UserContext;
  action?: AiAction | string;
  model?: string | null;
  apiKey?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceUrl?: string | null;
  prompt?: string | null;
  keySource?: AiKeySource;
  skipUsageLog?: boolean;
  code: string;
  source: AiErrorSource;
  message: string;
  details: string;
  status: number;
  providerStatus?: number | null;
  providerMessage?: string | null;
  contentLength?: number | null;
}) {
  const { eventId } = await recordAiError({
    endpoint: "/api/ai",
    action: VALID_ACTIONS.has(action ?? "") ? (action as AiAction) : undefined,
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
    contentLength,
    userAgent: req.headers.get("user-agent"),
    requestContext: {
      hasUserApiKey: Boolean(apiKey?.trim()),
      requestedAction: action ?? null,
    },
  });

  if (!skipUsageLog) {
    await recordAiUsage({
      userId: user?.id,
      model,
      action: action ?? "unknown",
      resourceType,
      resourceId,
      resourceUrl,
      prompt,
      status: "error",
      errorMessage: providerMessage ?? message,
      keySource: keySource ?? (apiKey ? "user_key" : "unknown"),
      metadata: {
        providerStatus: providerStatus ?? null,
        code,
        source,
      },
    });
  }

  return NextResponse.json({ code, error: code, message, details, eventId }, { status });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const action = readOptionalString(body?.action);
  const content = readOptionalString(body?.content);
  const userApiKey = readOptionalString(body?.apiKey)?.trim();
  const keyId = readOptionalString(body?.keyId)?.trim();
  const requestedModel = readOptionalString(body?.model)?.trim();
  const resourceType = readOptionalString(body?.resourceType)?.trim();
  const resourceId = readOptionalString(body?.resourceId)?.trim();
  const resourceUrl = readOptionalString(body?.resourceUrl)?.trim();
  const contentLength = typeof content === "string" ? content.length : 0;

  if (!action || !VALID_ACTIONS.has(action)) {
    return aiErrorResponse({
      req,
      action,
      model: requestedModel,
      apiKey: userApiKey,
      code: "invalid_action",
      source: "validation",
      message: "The AI action is not supported.",
      details: "Reload the app. If this persists, the client is sending a stale or invalid action.",
      status: 400,
      contentLength,
    });
  }
  if (!content?.trim()) {
    return aiErrorResponse({
      req,
      action,
      model: requestedModel,
      apiKey: userApiKey,
      code: "no_content",
      source: "validation",
      message: "There is no note content to send to AI.",
      details: "Write some content first, then run the AI action again.",
      status: 400,
      contentLength,
    });
  }
  if (contentLength > MAX_AI_CONTENT_CHARS) {
    return aiErrorResponse({
      req,
      action,
      model: requestedModel,
      apiKey: userApiKey,
      code: "content_too_large",
      source: "validation",
      message: `The note is over the ${MAX_AI_CONTENT_CHARS.toLocaleString()} character AI limit.`,
      details: "Select a shorter note or split the content before retrying.",
      status: 413,
      contentLength,
    });
  }

  if (requestedModel && !isAiModelId(requestedModel)) {
    return aiErrorResponse({
      req,
      action,
      model: requestedModel,
      apiKey: userApiKey,
      code: "invalid_model",
      source: "validation",
      message: "The selected AI model is not supported.",
      details: "Open Settings -> AI and choose one of the supported Gemini models.",
      status: 400,
      contentLength,
    });
  }

  const model = (requestedModel as AiModelId | undefined) || ACTION_DEFAULTS[action as AiAction];
  let user: UserContext = null;

  const authResult = await getAuthenticatedUser().catch(() => ({ user: null }));
  user = authResult.user;

  if (userApiKey && keyId) {
    return aiErrorResponse({
      req,
      user,
      action,
      model,
      apiKey: userApiKey,
      code: "invalid_key",
      source: "validation",
      message: "Choose either a saved key or an inline key, not both.",
      details: "Reload the app and retry the AI action.",
      status: 400,
      contentLength,
    });
  }

  if (!user && !userApiKey) {
    return aiErrorResponse({
      req,
      user,
      action,
      model,
      apiKey: userApiKey,
      code: "authentication_required",
      source: "auth",
      message: "Sign in before using the shared AI key.",
      details: "Personal API keys can be tested in Settings -> AI after signing in.",
      status: 401,
      contentLength,
    });
  }

  let apiKey = userApiKey || null;
  let keySource: AiKeySource = userApiKey ? "user_key" : "owner_key";

  if (keyId) {
    if (!user) {
      return aiErrorResponse({
        req,
        user,
        action,
        model,
        apiKey: null,
        code: "authentication_required",
        source: "auth",
        message: "Sign in before using a saved AI key.",
        details: "Saved AI keys are scoped to your account.",
        status: 401,
        contentLength,
      });
    }
    const storedKey = await getDecryptedAiProviderKey({ userId: user.id, keyId });
    if (!storedKey) {
      return aiErrorResponse({
        req,
        user,
        action,
        model,
        apiKey: null,
        code: "invalid_key",
        source: "validation",
        message: "Saved AI key was not found.",
        details: "Open Profile -> AI Keys and choose an existing key.",
        status: 404,
        contentLength,
      });
    }
    apiKey = storedKey.apiKey;
    keySource = "user_key";
  }

  const client = apiKey ? new GoogleGenAI({ apiKey }) : serverGenai;
  if (!client) {
    return aiErrorResponse({
      req,
      user,
      action,
      model,
      apiKey,
      code: "server_not_configured",
      source: "config",
      message: "Server AI is not configured.",
      details: "GEMINI_API_KEY is missing on the server. Add a personal key in Settings -> AI or configure the deployment.",
      status: 503,
      contentLength,
    });
  }

  const prompt = PROMPTS[action as AiAction](content);

  try {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
    });
    const usage = readUsageMetadata(response);
    await recordAiUsage({
      userId: user?.id,
      model,
      action,
      resourceType: resourceType || null,
      resourceId: resourceId || null,
      resourceUrl: resourceUrl || null,
      prompt,
      status: "success",
      keySource,
      ...usage,
    });
    return NextResponse.json({ result: (response.text ?? "").trim() });
  } catch (err) {
    console.error(`[AI/${action}]`, err);
    const classified = classifyGeminiGenerationError(err);
    await recordAiUsage({
      userId: user?.id,
      model,
      action,
      resourceType: resourceType || null,
      resourceId: resourceId || null,
      resourceUrl: resourceUrl || null,
      prompt,
      status: "error",
      errorMessage: classified.providerMessage ?? classified.message,
      keySource,
      metadata: {
        providerStatus: classified.providerStatus ?? null,
        code: classified.code,
      },
    });
    return aiErrorResponse({
      req,
      user,
      action,
      model,
      apiKey,
      resourceType: resourceType || null,
      resourceId: resourceId || null,
      resourceUrl: resourceUrl || null,
      prompt,
      keySource,
      skipUsageLog: true,
      contentLength,
      ...classified,
    });
  }
}
