import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

const CREDENTIAL_PROVIDER_ID = "credential";
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

type RequestBody = {
	email?: string;
};

type EmailProviderResponse = {
	exists: boolean;
	hasPassword: boolean;
	providers: string[];
};

// Returned for every email that is not OAuth-only (no account, a password
// account, or a password+OAuth account). Keeping these cases byte-for-byte
// identical stops the endpoint being used as an account-existence oracle:
// only the OAuth-only case — which the sign-up UX must reveal to steer the
// user to their provider — deviates from this neutral payload.
const NON_DISCLOSING_RESPONSE: EmailProviderResponse = {
	exists: false,
	hasPassword: false,
	providers: [],
};

/**
 * Reports the OAuth providers to steer an OAuth-only email toward during
 * sign-up. Any email that already has a password login — or no account at
 * all — returns an identical neutral response, so the endpoint cannot be
 * used to confirm which emails are registered.
 */
export async function POST(request: NextRequest) {
	const ip = getRequestIp(request.headers);
	const { allowed } = await checkRateLimit(
		`email-provider:${ip}`,
		RATE_LIMIT_MAX,
		RATE_LIMIT_WINDOW_MS,
	);
	if (!allowed) {
		return NextResponse.json({ error: "Too many requests." }, { status: 429 });
	}

	const body = (await request.json().catch(() => null)) as RequestBody | null;
	const email = body?.email?.trim().toLowerCase();
	if (!email) {
		return NextResponse.json({ error: "Missing email." }, { status: 400 });
	}

	const user = await prisma.user.findFirst({
		where: { email: { equals: email, mode: "insensitive" } },
		select: { accounts: { select: { providerId: true, password: true } } },
	});

	if (!user) {
		return NextResponse.json(NON_DISCLOSING_RESPONSE);
	}

	const accounts: Array<{ providerId: string; password: string | null }> = user.accounts;
	const hasPassword = accounts.some(
		(account) => account.providerId === CREDENTIAL_PROVIDER_ID || account.password != null,
	);
	const providers = Array.from(
		new Set(
			accounts
				.map((account) => account.providerId)
				.filter((providerId) => providerId !== CREDENTIAL_PROVIDER_ID),
		),
	);

	if (hasPassword || providers.length === 0) {
		return NextResponse.json(NON_DISCLOSING_RESPONSE);
	}

	const payload: EmailProviderResponse = {
		exists: true,
		hasPassword: false,
		providers,
	};
	return NextResponse.json(payload);
}
