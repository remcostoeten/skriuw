export const SKRIUW_PROJECT_ID = "skriuw";

export function resolveClientIngestUrl(): string | undefined {
	const url = process.env.NEXT_PUBLIC_ANALYTICS_URL?.trim();
	return url || undefined;
}

export function resolveServerIngestUrl(): string | undefined {
	const url = process.env.ANALYTICS_URL?.trim();
	return url || resolveClientIngestUrl();
}

export function resolveIngestSecret(): string | undefined {
	const secret = process.env.INGEST_SECRET?.trim();
	return secret || undefined;
}

export function isClientAnalyticsDisabled(): boolean {
	if (!resolveClientIngestUrl()) return true;
	return process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true";
}

export function isServerAnalyticsConfigured(): boolean {
	return Boolean(resolveServerIngestUrl() && resolveIngestSecret());
}
