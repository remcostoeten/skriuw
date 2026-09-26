import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import {
	deleteUserStorageConfig,
	getUserStorageConfigSummary,
	saveUserStorageConfig,
} from "@/domain/storage/config";

export async function GET() {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const config = await getUserStorageConfigSummary(user.id);
	return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	const body = await req.json().catch(() => ({}));

	try {
		const config = await saveUserStorageConfig(user.id, body);
		return NextResponse.json({ config }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not save storage config.";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

export async function DELETE() {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	await deleteUserStorageConfig(user.id);
	return NextResponse.json({ ok: true });
}
