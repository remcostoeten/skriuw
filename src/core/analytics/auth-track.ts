import "server-only";

import { createAuthMiddleware } from "better-auth/api";
import { trackSkriuwServer } from "./server-track";

type AuthMethod = "email" | "github";
type AuthAction = "signin" | "signup";

function resolveAuthMethod(path: string): AuthMethod | null {
	if (path === "/sign-up/email" || path === "/sign-in/email") {
		return "email";
	}

	if (path.startsWith("/callback/")) {
		const provider = path.slice("/callback/".length).split("/")[0];
		if (provider === "github") {
			return "github";
		}
	}

	return null;
}

function isRecentSignup(createdAt: Date | string | undefined): boolean {
	if (!createdAt) {
		return false;
	}

	const ageMs = Date.now() - new Date(createdAt).getTime();
	return ageMs >= 0 && ageMs < 10_000;
}

async function trackAuthCompleted(action: AuthAction, method: AuthMethod): Promise<void> {
	await trackSkriuwServer(`auth_${action}_completed`, { method }, "/auth");
}

export const authAnalyticsHook = createAuthMiddleware(async (ctx) => {
	if (!ctx.context.newSession) {
		return;
	}

	const path = ctx.path;
	const method = resolveAuthMethod(path);
	if (!method) {
		return;
	}

	if (path === "/sign-up/email") {
		await trackAuthCompleted("signup", method);
		return;
	}

	if (path === "/sign-in/email") {
		await trackAuthCompleted("signin", method);
		return;
	}

	if (path.startsWith("/callback/")) {
		const action = isRecentSignup(ctx.context.newSession.user.createdAt) ? "signup" : "signin";
		await trackAuthCompleted(action, method);
	}
});
