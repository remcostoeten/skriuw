import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/core/db";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyStepUp } from "@/lib/step-up";

const SET_PASSWORD_RATE_LIMIT_MAX = 5;
const SET_PASSWORD_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type SetPasswordBody = {
	newPassword?: string;
};

/**
 * Adds the credential provider to an OAuth-only account. Better Auth owns the
 * password hashing and account creation; this route adds the same step-up and
 * rate-limit protections used by the other sensitive account controls.
 */
export async function POST(request: NextRequest) {
	let userId: string;
	try {
		const { user } = await getAuthenticatedUser();
		userId = user.id;
	} catch {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const { allowed } = await checkRateLimit(
		`account-set-password:${userId}`,
		SET_PASSWORD_RATE_LIMIT_MAX,
		SET_PASSWORD_RATE_LIMIT_WINDOW_MS,
	);
	if (!allowed) {
		return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
	}

	const body = (await request.json().catch(() => null)) as SetPasswordBody | null;
	const newPassword = body?.newPassword;
	if (!newPassword) {
		return NextResponse.json({ error: "Enter a password." }, { status: 400 });
	}

	const stepUp = await verifyStepUp({});
	if (!stepUp.ok) {
		return NextResponse.json(
			{ error: stepUp.error, code: stepUp.code },
			{ status: stepUp.status },
		);
	}

	try {
		await auth.api.setPassword({
			headers: await headers(),
			body: { newPassword },
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Could not add a password." },
			{ status: 400 },
		);
	}

	return NextResponse.json({ ok: true });
}
