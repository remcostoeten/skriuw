import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ALLOWED_MODEL_IDS, DEFAULT_AI_MODEL } from "@/features/ai/constants";

function classifyGeminiError(err: unknown): { code: string; message: string } {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = (err as { status?: number }).status;

  if (status === 401 || msg.includes("api_key_invalid") || msg.includes("unauthenticated")) {
    return { code: "invalid_key", message: "API key is invalid or not authorized." };
  }
  if (status === 429 || msg.includes("resource_exhausted") || msg.includes("quota")) {
    return { code: "rate_limited", message: "Key is rate limited or quota exceeded. Try again later." };
  }
  if (status === 403 || msg.includes("permission_denied")) {
    return { code: "forbidden", message: "Key lacks permission for this model." };
  }
  if (status === 404 || msg.includes("not_found") || msg.includes("not found")) {
    return { code: "model_not_found", message: "Model not found. Try a different model." };
  }

  return { code: "error", message: "Could not connect to Gemini API." };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { apiKey?: string; model?: string };
  const apiKey = body.apiKey?.trim();
  const model =
    body.model && ALLOWED_MODEL_IDS.has(body.model) ? body.model : DEFAULT_AI_MODEL;

  if (!apiKey) {
    return NextResponse.json({ code: "no_key", message: "No API key provided." }, { status: 400 });
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
    const { code, message } = classifyGeminiError(synthetic);
    const httpStatus =
      code === "invalid_key" ? 401
      : code === "rate_limited" ? 429
      : code === "forbidden" ? 403
      : 500;

    return NextResponse.json({ code, message }, { status: httpStatus });
  } catch (err) {
    console.error("[AI/test-key]", err);
    const { code, message } = classifyGeminiError(err);
    return NextResponse.json({ code, message }, { status: 500 });
  }
}
