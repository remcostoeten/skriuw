import { GoogleGenAI } from "@google/genai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function classifyError(err: unknown): { code: string; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number }).status;

  if (
    status === 401 ||
    msg.includes("API_KEY_INVALID") ||
    msg.includes("UNAUTHENTICATED") ||
    msg.includes("invalid api key")
  ) {
    return { code: "invalid_key", message: "API key is invalid or not authorized." };
  }
  if (status === 429 || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
    return { code: "rate_limited", message: "Key is rate limited or quota exceeded. Try again later." };
  }
  if (status === 403 || msg.includes("PERMISSION_DENIED")) {
    return {
      code: "forbidden",
      message: "Key does not have permission for this model. Check API key restrictions.",
    };
  }
  if (status === 404 || msg.includes("NOT_FOUND") || msg.includes("not found")) {
    return { code: "model_not_found", message: "Model not found. Try a different model." };
  }

  return { code: "error", message: "Could not connect to Gemini API. Check your key and try again." };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { apiKey?: string; model?: string };
  const apiKey = body.apiKey?.trim();
  const model = body.model ?? "gemini-2.5-flash";

  if (!apiKey) {
    return NextResponse.json({ code: "no_key", message: "No API key provided." }, { status: 400 });
  }

  const genai = new GoogleGenAI({ apiKey });

  try {
    await genai.models.generateContent({
      model,
      contents: "Hi",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[AI/test-key]", err);
    const { code, message } = classifyError(err);
    const httpStatus = code === "invalid_key" ? 401 : code === "rate_limited" ? 429 : code === "forbidden" ? 403 : 500;
    return NextResponse.json({ code, message }, { status: httpStatus });
  }
}
