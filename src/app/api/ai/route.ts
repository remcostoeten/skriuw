import { GoogleGenAI } from "@google/genai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { ALLOWED_MODEL_IDS, DEFAULT_AI_MODEL, MAX_AI_CONTENT_CHARS } from "@/features/ai/constants";
import type { AiAction } from "@/features/ai/service";

const serverGenai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

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

const VALID_ACTIONS = new Set<string>(["generateTitle", "spellCheck", "continueWriting"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;
  const content = body?.content as string | undefined;
  const userApiKey = (body?.apiKey as string | undefined)?.trim();
  const requestedModel = (body?.model as string | undefined)?.trim();

  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!content?.trim()) {
    return NextResponse.json({ error: "No content" }, { status: 400 });
  }
  if (content.length > MAX_AI_CONTENT_CHARS) {
    return NextResponse.json(
      { error: `Content exceeds ${MAX_AI_CONTENT_CHARS.toLocaleString()} character limit` },
      { status: 413 },
    );
  }

  const model =
    requestedModel && ALLOWED_MODEL_IDS.has(requestedModel)
      ? requestedModel
      : ACTION_DEFAULTS[action as AiAction];

  // Require authentication when falling back to server key
  if (!userApiKey) {
    const { user } = await getAuthenticatedUser().catch(() => ({ user: null }));
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  }

  const client = userApiKey ? new GoogleGenAI({ apiKey: userApiKey }) : serverGenai;

  try {
    const response = await client.models.generateContent({
      model,
      contents: PROMPTS[action as AiAction](content),
    });
    return NextResponse.json({ result: (response.text ?? "").trim() });
  } catch (err) {
    console.error(`[AI/${action}]`, err);
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status;
    if (status === 429 || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
      return NextResponse.json({ error: "rate_limited", code: "rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
