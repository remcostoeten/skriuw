/** Shared demo-guest credentials and feature flag (safe on client for email display only). */

export function isDemoGuestModeEnabled(): boolean {
	return process.env.SKRIUW_DEMO_GUEST_MODE === "true";
}

export function getDemoGuestCredentials() {
	return {
		email: process.env.SKRIUW_DEMO_GUEST_EMAIL ?? "guest@demo.skriuw.local",
		password: process.env.SKRIUW_DEMO_GUEST_PASSWORD ?? "demo-guest-skriuw",
		name: process.env.SKRIUW_DEMO_GUEST_NAME ?? "Guest demo",
	};
}

export function isDemoGuestEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return email === getDemoGuestCredentials().email;
}
