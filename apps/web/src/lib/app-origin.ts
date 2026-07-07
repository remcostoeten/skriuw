const LOCAL_APP_ORIGIN = "http://localhost:3000";
const PRODUCTION_APP_ORIGIN = "https://skriuw.com";

const KNOWN_APP_HOSTS = ["skriuw.com", "www.skriuw.com", "skriuw.app"] as const;

function unique<T>(values: T[]): T[] {
	return values.filter((value, index, all) => all.indexOf(value) === index);
}

function normalizeOrigin(value: string | null | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;

	try {
		const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
		return url.origin;
	} catch {
		return undefined;
	}
}

function hostFromOrigin(origin: string | undefined): string | undefined {
	if (!origin) return undefined;

	try {
		return new URL(origin).host;
	} catch {
		return undefined;
	}
}

export function getConfiguredAppOrigins(): string[] {
	return unique(
		[
			process.env.BETTER_AUTH_URL,
			process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
			process.env.VERCEL_PROJECT_PRODUCTION_URL,
			process.env.VERCEL_URL,
		]
			.map(normalizeOrigin)
			.filter((origin): origin is string => Boolean(origin)),
	);
}

export function getServerAppOrigin(): string | undefined {
	return (
		getConfiguredAppOrigins()[0] ??
		(process.env.NODE_ENV === "production" ? undefined : LOCAL_APP_ORIGIN)
	);
}

export function getBrowserAppOrigin(): string | undefined {
	if (typeof window !== "undefined") {
		const origin = window.location.origin;
		// The desktop (Tauri) webview serves the app from a custom scheme
		// (tauri://localhost). Better Auth throws on any base URL that isn't
		// http(s), which aborts SPA bootstrap and leaves the app stuck on the
		// splash, so fall back to the configured/production origin there.
		if (/^https?:\/\//.test(origin)) {
			return origin;
		}
		return getServerAppOrigin() ?? PRODUCTION_APP_ORIGIN;
	}

	return getServerAppOrigin();
}

export function getBetterAuthBaseURL() {
	const configuredOrigins = getConfiguredAppOrigins();
	const fallback =
		configuredOrigins[0] ??
		(process.env.NODE_ENV === "production" ? "https://skriuw.com" : LOCAL_APP_ORIGIN);
	const allowedHosts = unique(
		[
			...KNOWN_APP_HOSTS,
			"localhost:3000",
			"127.0.0.1:3000",
			"*.vercel.app",
			...configuredOrigins.map(hostFromOrigin),
		].filter((host): host is string => Boolean(host)),
	);

	return {
		allowedHosts,
		fallback,
		protocol: "auto" as const,
	};
}
