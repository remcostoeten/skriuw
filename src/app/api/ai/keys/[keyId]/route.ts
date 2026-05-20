import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { deleteAiProviderKey, updateAiProviderKeyLabel } from "@/domain/ai/provider-keys";

type RouteContext = {
	params: Promise<{ keyId: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
	const { user } = await getAuthenticatedUser().catch(() => ({ user: null }));
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const { keyId } = await context.params;
	const body = (await req.json().catch(() => ({}))) as { label?: string };

	try {
		const key = await updateAiProviderKeyLabel({
			userId: user.id,
			keyId,
			label: body.label ?? "",
		});
		return NextResponse.json({ key });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Could not update AI key." },
			{ status: 400 },
		);
	}
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
	const { user } = await getAuthenticatedUser().catch(() => ({ user: null }));
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const { keyId } = await context.params;
	await deleteAiProviderKey(user.id, keyId);
	return NextResponse.json({ ok: true });
}
