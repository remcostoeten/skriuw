import { APIError } from "better-auth/api";
import { type NextRequest, NextResponse } from "next/server";
import { ensureDemoGuestUser } from "@/core/demo-guest/ensure-user";
import { auth } from "@/lib/auth";
import { forwardAuthCookies, safeRedirectPath } from "@/lib/auth-cookies";
import { getDemoGuestCredentials, isDemoGuestModeEnabled } from "@/lib/demo-guest";

/** Creates/signs in the shared demo user and redirects with a real session cookie. */
export async function GET(req: NextRequest) {
	if (!isDemoGuestModeEnabled()) {
		return NextResponse.json({ error: "Demo guest mode is disabled." }, { status: 404 });
	}

	const nextPath = safeRedirectPath(req.nextUrl.searchParams.get("next"));

	try {
		await ensureDemoGuestUser();
		const { email, password } = getDemoGuestCredentials();

		const signInResponse = await auth.api.signInEmail({
			body: { email, password },
			asResponse: true,
		});

		if (!signInResponse.ok) {
			return NextResponse.json(
				{ error: "Demo guest sign-in failed." },
				{ status: 500 },
			);
		}

		const redirect = NextResponse.redirect(new URL(nextPath, req.url));
		forwardAuthCookies(signInResponse, redirect);
		return redirect;
	} catch (error) {
		const message =
			error instanceof APIError
				? error.message
				: error instanceof Error
					? error.message
					: "Demo guest bootstrap failed.";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
