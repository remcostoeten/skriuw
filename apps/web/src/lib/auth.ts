import { authAnalyticsHook } from "@/core/analytics/auth-track";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { getBetterAuthBaseURL } from "./app-origin";
import { prisma } from "./prisma";

const hasGithubCredentials = Boolean(
	process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
);
const hasGoogleCredentials = Boolean(
	process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

const socialProviders = {
	...(hasGithubCredentials
		? {
				github: {
					clientId: process.env.GITHUB_CLIENT_ID!,
					clientSecret: process.env.GITHUB_CLIENT_SECRET!,
					scope: ["read:user", "user:email"],
					mapProfileToUser: (profile: {
						id?: string | number;
						login?: string | null;
						email?: string | null;
					}) => ({
						email: profile.email ?? getGithubFallbackEmail(profile),
					}),
				},
			}
		: {}),
	...(hasGoogleCredentials
		? {
				google: {
					clientId: process.env.GOOGLE_CLIENT_ID!,
					clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
				},
			}
		: {}),
};

function getGithubFallbackEmail(profile: { id?: string | number; login?: string | null }): string {
	const githubId = String(profile.id ?? "unknown");
	const login = (profile.login ?? "user").toLowerCase().replace(/[^a-z0-9-]/g, "-");

	return `${githubId}+${login}@github.local`;
}

export const auth = betterAuth({
	baseURL: getBetterAuthBaseURL(),
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	emailAndPassword: {
		enabled: true,
		autoSignIn: true,
		// Email verification is deferred until the app has the supporting mail flow
		// and anti-abuse handling wired up.
		requireEmailVerification: false,
	},
	socialProviders: Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
	plugins: [
		username({
			minUsernameLength: 3,
			maxUsernameLength: 30,
		}),
		admin({
			defaultRole: "user",
			adminRoles: ["admin"],
		}),
		nextCookies(),
	],
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24,
	},
	rateLimit: {
		enabled: process.env.NODE_ENV === "production",
		window: 60,
		max: 100,
		storage: "database",
		modelName: "rateLimit",
	},
	hooks: {
		after: authAnalyticsHook,
	},
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
