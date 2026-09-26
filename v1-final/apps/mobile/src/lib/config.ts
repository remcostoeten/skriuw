import Constants from "expo-constants";
import { Platform } from "react-native";

/** Base URL of the Skriuw web/API deployment. Override per-environment via
 *  app.json `extra.apiBaseUrl` or an EAS build profile env. */
export function getApiBaseUrl(): string {
	const fromEnvironment = process.env.EXPO_PUBLIC_API_BASE_URL;
	const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
		?.apiBaseUrl;
	// Expo web is served from port 8081 during local development while Next (and
	// Better Auth) serves the API on 3000. An explicit environment value always
	// wins, including when testing against a remote deployment.
	const localWebApi = Platform.OS === "web" && __DEV__ ? "http://localhost:3000" : undefined;
	return (fromEnvironment ?? localWebApi ?? fromExtra ?? "https://skriuw.com").replace(/\/$/, "");
}
