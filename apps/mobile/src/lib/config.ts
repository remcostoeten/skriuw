import Constants from "expo-constants";

/** Base URL of the Skriuw web/API deployment. Override per-environment via
 *  app.json `extra.apiBaseUrl` or an EAS build profile env. */
export function getApiBaseUrl(): string {
	const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
		?.apiBaseUrl;
	return fromExtra ?? "https://skriuw.com";
}
