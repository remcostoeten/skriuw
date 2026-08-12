import "server-only";

import { prisma } from "@/lib/prisma";

type RateLimitResult = {
	allowed: boolean;
	remaining: number;
};

/**
 * Fixed-window rate limiter backed by better-auth's `rate_limit` table, so
 * custom route handlers (outside better-auth's own endpoints) can share the
 * same storage instead of each inventing their own. Tolerant of a benign
 * read-then-write race under concurrent requests in the same window — that
 * only costs a slightly looser limit, which is fine for abuse prevention.
 */
export async function checkRateLimit(
	key: string,
	max: number,
	windowMs: number,
): Promise<RateLimitResult> {
	const now = Date.now();
	const existing = await prisma.rateLimit.findUnique({ where: { key } });

	const windowExpired =
		!existing || existing.lastRequest === null || now - Number(existing.lastRequest) > windowMs;

	if (windowExpired) {
		await prisma.rateLimit.upsert({
			where: { key },
			create: { id: key, key, count: 1, lastRequest: BigInt(now) },
			update: { count: 1, lastRequest: BigInt(now) },
		});
		return { allowed: true, remaining: max - 1 };
	}

	if (existing.count >= max) {
		return { allowed: false, remaining: 0 };
	}

	await prisma.rateLimit.update({
		where: { key },
		data: { count: { increment: 1 }, lastRequest: BigInt(now) },
	});
	return { allowed: true, remaining: max - existing.count - 1 };
}

/** Best-effort client IP, mirroring the extraction used for share-view logging. */
export function getRequestIp(requestHeaders: Headers): string {
	const forwarded = requestHeaders.get("x-forwarded-for");
	return forwarded?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
}
