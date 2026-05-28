/** Ephemeral per-visitor trial workspaces (isolated DB users, not shared demo guest). */

export const TRIAL_EMAIL_DOMAIN = "trial.skriuw.local";
export const TRIAL_COOKIE_NAME = "skriuw_trial_slug";

export function isTrialModeEnabled(): boolean {
	return process.env.SKRIUW_TRIAL_MODE === "true";
}

export function getTrialMaxAgeSeconds(): number {
	const hours = Number(process.env.SKRIUW_TRIAL_MAX_AGE_HOURS ?? "48");
	if (!Number.isFinite(hours) || hours <= 0) {
		return 48 * 60 * 60;
	}
	return Math.floor(hours * 60 * 60);
}

export function trialEmailForSlug(slug: string): string {
	return `trial-${slug}@${TRIAL_EMAIL_DOMAIN}`;
}

export function isTrialEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return email.endsWith(`@${TRIAL_EMAIL_DOMAIN}`);
}

export function parseTrialSlugFromEmail(email: string | null | undefined): string | null {
	if (!isTrialEmail(email)) return null;
	const local = email?.split("@")[0] ?? "";
	if (!local.startsWith("trial-")) return null;
	return local.slice("trial-".length) || null;
}
