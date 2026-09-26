import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS });
}

export async function POST() {
	try {
		const result = await auth.api.deviceCode({
			body: { client_id: "skriuw-desktop", scope: "sync" },
		});
		return NextResponse.json(result, { headers: CORS });
	} catch {
		return NextResponse.json(
			{ error: "Desktop sign-in could not be started." },
			{ status: 400, headers: CORS },
		);
	}
}
