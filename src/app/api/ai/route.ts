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
import { recordAiError, type AiErrorSource } from "@/features/ai/telemetry";

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

  return NextResponse.json({ code, error: code, message, details, eventId }, { status });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;
  const content = body?.content as string | undefined;
  const userApiKey = (body?.apiKey as string | undefined)?.trim();
  const requestedModel = (body?.model as string | undefined)?.trim();

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
      contentLength: typeof content === "string" ? content.length : null,
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
      contentLength: typeof content === "string" ? content.length : null,
    });
  }
  if (content.length > MAX_AI_CONTENT_CHARS) {
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
      contentLength: content.length,
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
      contentLength: content.length,
    });
  }

  const model = (requestedModel as AiModelId | undefined) || ACTION_DEFAULTS[action as AiAction];
  let user: UserContext = null;

  const authResult = await getAuthenticatedUser().catch(() => ({ user: null }));
  user = authResult.user;

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
      contentLength: content.length,
    });
  }

  const client = userApiKey ? new GoogleGenAI({ apiKey: userApiKey }) : serverGenai;
  if (!client) {
    return aiErrorResponse({
      req,
      user,
      action,
      model,
      apiKey: userApiKey,
      code: "server_not_configured",
      source: "config",
      message: "Server AI is not configured.",
      details: "GEMINI_API_KEY is missing on the server. Add a personal key in Settings -> AI or configure the deployment.",
      status: 503,
      contentLength: content.length,
    });
  }

  try {
    const response = await client.models.generateContent({
      model,
      contents: PROMPTS[action as AiAction](content),
    });
    return NextResponse.json({ result: (response.text ?? "").trim() });
  } catch (err) {
    console.error(`[AI/${action}]`, err);
    return aiErrorResponse({
      req,
      user,
      action,
      model,
      apiKey: userApiKey,
      contentLength: content.length,
      ...classifyGeminiGenerationError(err),
    });
  }
}
