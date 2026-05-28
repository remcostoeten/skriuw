import { APIError } from "better-auth/api";
import { type NextRequest, NextResponse } from "next/server";
import { provisionTrialUser, signInTrialUser } from "@/core/trial/session";
import { forwardAuthCookies, safeRedirectPath } from "@/lib/auth-cookies";
import {
	getTrialMaxAgeSeconds,
	isTrialModeEnabled,
	TRIAL_COOKIE_NAME,
} from "@/lib/trial";

export async function GET(req: NextRequest) {
	if (!isTrialModeEnabled()) {
		return NextResponse.json({ error: "Trial mode is disabled." }, { status: 404 });
	}

	const nextPath = safeRedirectPath(req.nextUrl.searchParams.get("next"));
	const existingSlug = req.cookies.get(TRIAL_COOKIE_NAME)?.value?.trim();
	const slug = existingSlug || crypto.randomUUID();

	try {
		await provisionTrialUser(slug);
		const signInResponse = await signInTrialUser(slug);

		if (!signInResponse.ok) {
			return NextResponse.json({ error: "Trial sign-in failed." }, { status: 500 });
		}

		const redirect = NextResponse.redirect(new URL(nextPath, req.url));
		redirect.cookies.set(TRIAL_COOKIE_NAME, slug, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			maxAge: getTrialMaxAgeSeconds(),
		});
		forwardAuthCookies(signInResponse, redirect);
		return redirect;
	} catch (error) {
		const message =
			error instanceof APIError
				? error.message
				: error instanceof Error
					? error.message
					: "Trial bootstrap failed.";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
