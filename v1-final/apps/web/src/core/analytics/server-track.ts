import "server-only";

import { trackServerEvent } from "@remcostoeten/analytics/server";
import {
	isServerAnalyticsConfigured,
	resolveIngestSecret,
	resolveServerIngestUrl,
	SKRIUW_PROJECT_ID,
} from "./config";

export async function trackSkriuwServer(
	name: string,
	meta?: Record<string, string | number | boolean>,
	path = "/server",
): Promise<void> {
	if (!isServerAnalyticsConfigured()) {
		return;
	}

	try {
		const options = {
			projectId: SKRIUW_PROJECT_ID,
			path,
			ingestUrl: resolveServerIngestUrl(),
			secret: resolveIngestSecret(),
		};
		if (meta) {
			await trackServerEvent(name, meta, options);
			return;
		}
		await trackServerEvent(name, options);
	} catch (error) {
		if (process.env.NODE_ENV !== "production") {
			console.error("[analytics]", error);
		}
	}
}
