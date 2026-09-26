import { NextResponse } from "next/server";
import { authenticateSyncBearer, revokeSyncToken } from "@/domain/sync/tokens";

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
	const credential = await authenticateSyncBearer(request);
	if (!credential) {
		return NextResponse.json(
			{ error: "Already disconnected." },
			{ status: 401, headers: CORS },
		);
	}
	await revokeSyncToken(credential.userId, credential.tokenId);
	return NextResponse.json({ success: true }, { headers: CORS });
}
