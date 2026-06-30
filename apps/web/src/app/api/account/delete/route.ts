import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedUser, prisma } from "@/core/db";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { noop } from "@/shared/lib/noop";

const DELETE_PHRASE = "delete my account";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
	let userId: string;
	try {
		const { user } = await getAuthenticatedUser();
		userId = user.id;
	} catch {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const { allowed } = await checkRateLimit(
		`account-delete:${userId}`,
		RATE_LIMIT_MAX,
		RATE_LIMIT_WINDOW_MS,
	);
	if (!allowed) {
		return NextResponse.json(
			{ error: "Too many attempts. Try again later." },
			{ status: 429 },
		);
	}

	const body = (await request.json().catch(() => null)) as { confirmation?: string } | null;
	if (body?.confirmation?.trim().toLowerCase() !== DELETE_PHRASE) {
		return NextResponse.json({ error: "Confirmation did not match." }, { status: 400 });
	}

	const requestHeaders = await headers();

	try {
		await auth.api.signOut({ headers: requestHeaders });
	} catch {
		// Best-effort cookie clear; the user.delete below will cascade any remaining session row.
		noop();
	}

	try {
		await prisma.user.delete({ where: { id: userId } });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Could not delete account." },
			{ status: 500 },
		);
	}

	return NextResponse.json({ ok: true });
}
