type AuthErrorKind = "network" | "configuration" | "credentials" | "validation" | "unknown";

export type AuthErrorNotice = {
	kind: AuthErrorKind;
	title: string;
	message: string;
};

export function resolveAuthError(error: unknown): AuthErrorNotice {
	if (!(error instanceof Error)) {
		return fallbackAuthError();
	}

	const message = error.message.trim();
	const normalized = message.toLowerCase();

	if (
		normalized === "failed to fetch" ||
		normalized.includes("networkerror") ||
		normalized.includes("network request failed") ||
		normalized.includes("fetch failed")
	) {
		return {
			kind: "network",
			title: "Connection problem",
			message: "We couldn't reach Skriuw. Check your connection and try again.",
		};
	}

	if (
		normalized.includes("too many redirects") ||
		normalized.includes("err_too_many_redirects") ||
		normalized.includes("invalid callback") ||
		normalized.includes("callback url")
	) {
		return {
			kind: "configuration",
			title: "Authentication redirect problem",
			message: "Check the callback URL, app origin, and OAuth provider settings.",
		};
	}

	if (
		normalized.includes("invalid login credentials") ||
		normalized.includes("invalid credentials") ||
		normalized.includes("invalid email or password")
	) {
		return {
			kind: "credentials",
			title: "Sign-in failed",
			message: "The email or password does not match an account.",
		};
	}

	if (message) {
		return {
			kind: "unknown",
			title: "Authentication failed",
			message,
		};
	}

	return fallbackAuthError();
}

function fallbackAuthError(): AuthErrorNotice {
	return {
		kind: "unknown",
		title: "Authentication failed",
		message: "Something went wrong. Try again.",
	};
}
