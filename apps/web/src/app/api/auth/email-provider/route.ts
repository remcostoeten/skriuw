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

/**
 * Reports whether an email already has an account and, if so, which OAuth
 * providers it is linked through and whether it also has a password login.
 *
 * The registration flow uses this to block sign-ups against an OAuth-only
 * email and steer the user to the right provider instead.
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
		const payload: EmailProviderResponse = {
			exists: false,
			hasPassword: false,
			providers: [],
		};
		return NextResponse.json(payload);
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

	const payload: EmailProviderResponse = {
		exists: true,
		hasPassword,
		providers,
	};
	return NextResponse.json(payload);
}
