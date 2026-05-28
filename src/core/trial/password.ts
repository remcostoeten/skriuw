import { createHmac } from "node:crypto";

function getTrialPasswordSecret(): string {
	const secret =
		process.env.SKRIUW_TRIAL_PASSWORD_SECRET ??
		process.env.BETTER_AUTH_SECRET ??
		"skriuw-trial-dev-only";
	if (process.env.NODE_ENV === "production" && secret === "skriuw-trial-dev-only") {
		throw new Error("Set BETTER_AUTH_SECRET or SKRIUW_TRIAL_PASSWORD_SECRET for trial mode.");
	}
	return secret;
}

/** Deterministic password for a trial slug so we can re-authenticate without storing credentials. */
export function trialPasswordForSlug(slug: string): string {
	return createHmac("sha256", getTrialPasswordSecret())
		.update(`trial:${slug}`)
		.digest("base64url");
}
