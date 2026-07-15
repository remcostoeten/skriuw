import { NextResponse } from "next/server";
import { createSyncToken } from "@/domain/sync/tokens";
import { auth } from "@/lib/auth";

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return NextResponse.json(
			{ error: "Authorization expired." },
			{ status: 401, headers: CORS },
		);
	}

	try {
		const credential = await createSyncToken({
			userId: session.user.id,
			name: "Skriuw Desktop",
			canWrite: true,
		});
		return NextResponse.json(
			{
				token: credential.token,
				account: {
					name: session.user.name,
					email: session.user.email,
					image: session.user.image ?? null,
				},
			},
			{ headers: CORS },
		);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Desktop access could not be created.",
			},
			{ status: 400, headers: CORS },
		);
	}
}
