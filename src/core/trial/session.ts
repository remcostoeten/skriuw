import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { trialEmailForSlug } from "@/lib/trial";
import { prisma } from "@/lib/prisma";
import { ensureStarterContentForUserId } from "@/domain/seed/provision";
import { trialPasswordForSlug } from "./password";

const TRIAL_DISPLAY_NAME = "Trial workspace";

export async function provisionTrialUser(slug: string): Promise<{ email: string; userId: string }> {
	const email = trialEmailForSlug(slug);
	const password = trialPasswordForSlug(slug);

	const existing = await prisma.user.findUnique({
		where: { email },
		select: { id: true, email: true },
	});

	if (!existing) {
		try {
			await auth.api.signUpEmail({
				body: { email, password, name: TRIAL_DISPLAY_NAME },
			});
		} catch (error) {
			if (!(error instanceof APIError) || error.status !== 422) {
				throw error;
			}
		}
	}

	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, email: true },
	});

	if (!user) {
		throw new Error("Trial user could not be created.");
	}

	await ensureStarterContentForUserId(user.id);
	return { email: user.email, userId: user.id };
}

export async function signInTrialUser(slug: string) {
	const email = trialEmailForSlug(slug);
	const password = trialPasswordForSlug(slug);

	return auth.api.signInEmail({
		body: { email, password },
		asResponse: true,
	});
}
