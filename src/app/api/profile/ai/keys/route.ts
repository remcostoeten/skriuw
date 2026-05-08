import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { createAiProviderKey, listAiProviderKeys } from "@/features/ai/provider-keys";

export async function GET() {
  const { user } = await getAuthenticatedUser().catch(() => ({ user: null }));
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const keys = await listAiProviderKeys(user.id);
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser().catch(() => ({ user: null }));
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    label?: string;
    apiKey?: string;
    provider?: "gemini";
  };

  try {
    const key = await createAiProviderKey({
      userId: user.id,
      label: body.label ?? "",
      apiKey: body.apiKey ?? "",
      provider: body.provider ?? "gemini",
    });
    return NextResponse.json({ key }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save AI key.";
    const status = message.includes("AI_KEYS_ENCRYPTION_SECRET") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
