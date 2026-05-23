import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export { prisma };

// Per-request memoization: auth.api.getSession() hits the DB once per request
// regardless of how many server components / query functions call getServerUser().
export const getServerUser = cache(async () => {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	return { prisma, user: session?.user ?? null };
});

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
