import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";

const hasGithubCredentials = Boolean(
	process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
);

const trustedOrigins = [process.env.BETTER_AUTH_URL, process.env.NEXT_PUBLIC_BETTER_AUTH_URL]
	.filter((value): value is string => Boolean(value))
	.filter((value, index, all) => all.indexOf(value) === index);

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	trustedOrigins,
	emailAndPassword: {
		enabled: true,
		autoSignIn: true,
		requireEmailVerification: false,
	},
	socialProviders: hasGithubCredentials
		? {
				github: {
					clientId: process.env.GITHUB_CLIENT_ID!,
					clientSecret: process.env.GITHUB_CLIENT_SECRET!,
				},
			}
		: undefined,
	plugins: [nextCookies()],
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
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
