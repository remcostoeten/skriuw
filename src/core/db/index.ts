import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export { prisma };

export async function getServerUser() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	return { prisma, user: session?.user ?? null };
}

export async function getAuthenticatedUser() {
	const { user } = await getServerUser();
	if (!user) {
		throw new Error("Not authenticated");
	}
	return { prisma, user };
}

export async function tryGetAuthenticatedUser() {
	const { user } = await getServerUser();
	return { prisma, user };
}
