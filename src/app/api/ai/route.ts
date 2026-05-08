import { GoogleGenAI } from "@google/genai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

type AiAction = "generateTitle" | "spellCheck" | "continueWriting";

const PROMPTS: Record<AiAction, (content: string) => string> = {
  generateTitle: (content) =>
    `Generate a short, concise title (max 6 words) for this document. Respond ONLY with the title text, no markdown, no quotes.\n\n${content}`,
  spellCheck: (content) =>
    `Act as a professional copy editor. Correct all spelling, grammar, and typography errors in the following Markdown document. Keep the structural formatting (headings, lists, bolding) exactly the same. Only fix the text inside it. Respond ONLY with the corrected markdown document, without any extra commentary.\n\n${content}`,
  continueWriting: (content) =>
    `Continue writing the following Markdown document. Preserve its tone, style, and formatting. Output ONLY the continuation text in Markdown, do NOT repeat the original text.\n\n${content}`,
};

const MODELS: Record<AiAction, string> = {
  generateTitle: "gemini-2.0-flash",
  spellCheck: "gemini-2.0-flash",
  continueWriting: "gemini-2.5-pro",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const action = body?.action as AiAction | undefined;
  const content = body?.content as string | undefined;
  const userApiKey = body?.apiKey as string | undefined;
  const userModel = body?.model as string | undefined;

  if (!action || !(action in PROMPTS)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!content?.trim()) {
    return NextResponse.json({ error: "No content" }, { status: 400 });
  }

  const client = userApiKey?.trim()
    ? new GoogleGenAI({ apiKey: userApiKey.trim() })
    : genai;

  const model = userModel?.trim() || MODELS[action];

  try {
    const response = await client.models.generateContent({
      model,
      contents: PROMPTS[action](content),
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
