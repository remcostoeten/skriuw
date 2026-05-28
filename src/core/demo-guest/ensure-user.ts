import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { getDemoGuestCredentials, isDemoGuestEmail } from "@/lib/demo-guest";
import { prisma } from "@/lib/prisma";
import { ensureStarterContentForUserId } from "@/domain/seed/provision";

/** Ensures the shared demo account exists and has starter content. */
export async function ensureDemoGuestUser(): Promise<{ userId: string; email: string }> {
	const { email, password, name } = getDemoGuestCredentials();

	let user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, email: true },
	});

	if (!user) {
		try {
			await auth.api.signUpEmail({
				body: { email, password, name },
			});
		} catch (error) {
			if (!(error instanceof APIError) || error.status !== 422) {
				throw error;
			}
		}

		user = await prisma.user.findUnique({
			where: { email },
			select: { id: true, email: true },
		});

		if (!user) {
			throw new Error("Demo guest user could not be created.");
		}
	}

	await ensureStarterContentForUserId(user.id);
	return { userId: user.id, email: user.email };
}

export async function findDemoGuestUserId(): Promise<string | null> {
	const { email } = getDemoGuestCredentials();
	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});
	return user?.id ?? null;
}

export { isDemoGuestEmail };
