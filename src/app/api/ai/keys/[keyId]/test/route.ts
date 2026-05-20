import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { testStoredAiProviderKey } from "@/domain/ai/provider-keys";
import { recordAiUsage } from "@/domain/ai/usage";

type RouteContext = {
	params: Promise<{ keyId: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
	const { user } = await getAuthenticatedUser().catch(() => ({ user: null }));
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const { keyId } = await context.params;
	const body = (await req.json().catch(() => ({}))) as { model?: string };
	const result = await testStoredAiProviderKey({ userId: user.id, keyId, model: body.model });

	await recordAiUsage({
		userId: user.id,
		model: body.model,
		action: "testKey",
		status: result.ok ? "success" : "error",
		errorMessage: result.ok ? null : result.message,
		keySource: "user_key",
		metadata: { keyId },
	});

	if (result.ok) return NextResponse.json({ ok: true });
	return NextResponse.json(result, { status: result.code === "not_found" ? 404 : 400 });
}
