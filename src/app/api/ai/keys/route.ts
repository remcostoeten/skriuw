import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { createAiProviderKey, listAiProviderKeys } from "@/domain/ai/provider-keys";

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
		provider?: string;
	};

	const provider = body.provider ?? "google";
	if (provider !== "google" && provider !== "groq") {
		return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
	}

	try {
		const key = await createAiProviderKey({
			userId: user.id,
			label: body.label ?? "",
			apiKey: body.apiKey ?? "",
			provider,
		});
		return NextResponse.json({ key }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (message.includes("AI_KEYS_ENCRYPTION_SECRET")) {
			console.error("[AI/keys] encryption is not configured", error);
			return NextResponse.json(
				{ error: "AI key storage is not configured." },
				{ status: 503 },
			);
		}
		return NextResponse.json({ error: message || "Could not save AI key." }, { status: 400 });
	}
}
