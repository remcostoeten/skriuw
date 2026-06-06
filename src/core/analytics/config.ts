export const SKRIUW_PROJECT_ID = "skriuw";

export function resolveClientIngestUrl(): string | undefined {
	const url = process.env.NEXT_PUBLIC_ANALYTICS_URL?.trim();
	return url || undefined;
}

export function isClientAnalyticsDisabled(): boolean {
	if (!resolveClientIngestUrl()) return true;
	return process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "false";
}
