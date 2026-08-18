import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

type EmailProviderResponse = {
	exists: boolean;
	hasPassword: boolean;
	providers: string[];
};

const NON_DISCLOSING_RESPONSE: EmailProviderResponse = {
	exists: false,
	hasPassword: false,
	providers: [],
};

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

	return NextResponse.json(NON_DISCLOSING_RESPONSE);
}
