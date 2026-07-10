import { authAnalyticsHook } from "@/core/analytics/auth-track";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { deriveAvatarColor } from "@/features/collaboration/lib/collab-token";
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
	// The Expo client has no cookie jar; the mobile app persists this custom-scheme
	// origin as its trusted redirect/session origin instead of an http(s) host.
	trustedOrigins: ["skriuw://"],
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	user: {
		additionalFields: {
			avatarColor: {
				type: "string",
				required: false,
				input: false,
			},
		},
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					const seed = user.id || user.email;
					return { data: { ...user, avatarColor: deriveAvatarColor(seed) } };
				},
			},
		},
	},
	emailAndPassword: {
		enabled: true,
		autoSignIn: true,
		// Email verification is deferred until the app has the supporting mail flow
		// and anti-abuse handling wired up.
		requireEmailVerification: false,
	},
	socialProviders: Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
	account: {
		accountLinking: {
			enabled: true,
			// Sign-in/sign-up doesn't require email verification yet, so trust these
			// providers explicitly — otherwise Better Auth refuses to link a social
			// account to an unverified-email user.
			trustedProviders: ["github", "google"],
			// Keep the framework's built-in last-account guard active as a backstop;
			// our /api/account/connections route also enforces it with a clear message.
			allowUnlinkingAll: false,
		},
	},
	plugins: [
		username({
			minUsernameLength: 3,
			maxUsernameLength: 30,
		}),
		admin({
			defaultRole: "user",
			adminRoles: ["admin"],
		}),
		expo(),
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
