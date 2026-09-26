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

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { deviceCode?: string };
		if (!body.deviceCode) throw new Error("Missing device code");
		const result = await auth.api.deviceToken({
			body: {
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: body.deviceCode,
				client_id: "skriuw-desktop",
			},
		});
		return NextResponse.json(result, { headers: CORS });
	} catch (error) {
		const details = error as { body?: { error?: string; error_description?: string } };
		return NextResponse.json(
			{
				error: details.body?.error ?? "device_authorization_failed",
				error_description:
					details.body?.error_description ?? "Desktop authorization is not ready.",
			},
			{ status: 400, headers: CORS },
		);
	}
}
