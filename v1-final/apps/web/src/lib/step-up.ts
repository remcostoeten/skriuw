import "server-only";

import { verifyPassword } from "better-auth/crypto";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CREDENTIAL_PROVIDER_ID = "credential";

// OAuth-only accounts have no password to re-enter, so step-up falls back to
// proving a *recent* interactive login: the session must have been created
// within this window. A stale session — a hijacked long-lived cookie, or a
// walk-up to an unlocked device days after sign-in — fails the check and must
// re-authenticate before any destructive action proceeds.
const OAUTH_STEP_UP_MAX_SESSION_AGE_MS = 15 * 60 * 1000;

export type StepUpFailureCode =
	| "unauthenticated"
	| "password_required"
	| "invalid_password"
	| "reauth_required";

export type StepUpResult =
	| { ok: true }
	| { ok: false; status: number; code: StepUpFailureCode; error: string };

/**
 * Enforces step-up re-authentication for sensitive/destructive account actions.
 *
 * Password accounts must submit their current password, verified against the
 * stored credential hash. OAuth-only accounts (no password to verify) must
 * instead present a session created within {@link OAUTH_STEP_UP_MAX_SESSION_AGE_MS};
 * a stale session is rejected with `reauth_required` so the client can prompt a
 * fresh OAuth sign-in. The relevant primitive is chosen from the account itself,
 * never the caller, so a hijacked session cannot downgrade the requirement.
 */
export async function verifyStepUp(input: { password?: string }): Promise<StepUpResult> {
	const requestHeaders = await headers();
	const session = await auth.api.getSession({ headers: requestHeaders });
	if (!session?.user) {
		return {
			ok: false,
			status: 401,
			code: "unauthenticated",
			error: "Not authenticated.",
		};
	}

	const credentialAccount = await prisma.account.findFirst({
		where: { userId: session.user.id, providerId: CREDENTIAL_PROVIDER_ID },
		select: { password: true },
	});

	const passwordHash = credentialAccount?.password;
	if (passwordHash) {
		const candidate = input.password?.trim();
		if (!candidate) {
			return {
				ok: false,
				status: 401,
				code: "password_required",
				error: "Enter your password to continue.",
			};
		}
		const valid = await verifyPassword({ hash: passwordHash, password: candidate });
		if (!valid) {
			return {
				ok: false,
				status: 403,
				code: "invalid_password",
				error: "Incorrect password.",
			};
		}
		return { ok: true };
	}

	const createdAt = session.session?.createdAt;
	const sessionAgeMs = createdAt
		? Date.now() - new Date(createdAt).getTime()
		: Number.POSITIVE_INFINITY;
	if (sessionAgeMs > OAUTH_STEP_UP_MAX_SESSION_AGE_MS) {
		return {
			ok: false,
			status: 401,
			code: "reauth_required",
			error: "For your security, re-authenticate before continuing.",
		};
	}

	return { ok: true };
}
