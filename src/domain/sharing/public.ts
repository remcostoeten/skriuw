import "server-only";

import { headers } from "next/headers";
import { trackSkriuwServer } from "@/core/analytics/server-track";
import { prisma } from "@/lib/prisma";
import type { RichTextDocument } from "@/domain/notes/models";
import { hashViewer, verifySharePassword } from "./crypto";
import { isExpired } from "./expiry";
import { buildSharePreviewDescription } from "./social-preview";
import type { TPublicSharePeek, TPublicShareResult } from "./models";

/**
 * Record a single open as a NoteShareView event. Best-effort: a logging
 * failure (including the table not yet existing on a not-fully-migrated
 * deployment) must never prevent a viewer from reading a shared note.
 */
async function logShareView(shareId: string, token: string): Promise<void> {
	try {
		const h = await headers();
		const forwarded = h.get("x-forwarded-for");
		const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
		const userAgent = h.get("user-agent");
		const referrer = h.get("referer");
		await prisma.noteShareView.create({
			data: {
				shareId,
				viewerHash: hashViewer({ ip, userAgent, token }),
				referrer: referrer ?? null,
				country: h.get("x-vercel-ip-country"),
			},
		});
	} catch {
		// swallow — analytics is non-critical
	}
}

/**
 * Non-consuming probe for the public route's server component. Returns no
 * content and never spends a view-once link, so it is safe under link-preview
 * crawlers and browser prefetch.
 */
export async function peekShare(token: string): Promise<TPublicSharePeek> {
	const share = await prisma.noteShare.findUnique({ where: { token } });
	if (!share) return { status: "not-found" };
	if (share.revokedAt) return { status: "revoked" };
	if (isExpired(share.expiresAt)) return { status: "expired" };
	if (share.viewOnce && share.consumedAt) return { status: "consumed" };
	return {
		status: "ready",
		requiresPassword: Boolean(share.passwordHash),
		viewOnce: share.viewOnce,
		name: share.name,
		description: buildSharePreviewDescription(
			share.content,
			Boolean(share.passwordHash),
		),
	};
}

/**
 * Validates access, then consumes (view-once, atomically) and returns the
 * frozen snapshot. Invoked only from a deliberate client gesture, never during
 * server render.
 */
export async function openShare(input: {
	token: string;
	password?: string;
}): Promise<TPublicShareResult> {
	const share = await prisma.noteShare.findUnique({ where: { token: input.token } });
	if (!share) return { status: "not-found" };
	if (share.revokedAt) return { status: "revoked" };
	if (isExpired(share.expiresAt)) return { status: "expired" };
	if (share.viewOnce && share.consumedAt) return { status: "consumed" };

	if (share.passwordHash) {
		if (!input.password) return { status: "need-password" };
		if (!(await verifySharePassword(input.password, share.passwordHash))) {
			return { status: "wrong-password" };
		}
	}

	const now = new Date();
	if (share.viewOnce) {
		// Atomic consume: only the first concurrent opener wins.
		const { count } = await prisma.noteShare.updateMany({
			where: {
				id: share.id,
				consumedAt: null,
				revokedAt: null,
				OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
			},
			data: { consumedAt: now, viewCount: { increment: 1 }, lastViewedAt: now },
		});
		if (count !== 1) {
			// Re-check which condition failed
			const recheck = await prisma.noteShare.findUnique({ where: { id: share.id } });
			if (!recheck) return { status: "not-found" };
			if (recheck.revokedAt) return { status: "revoked" };
			if (isExpired(recheck.expiresAt)) return { status: "expired" };
			return { status: "consumed" };
		}
	} else {
		const { count } = await prisma.noteShare.updateMany({
			where: {
				id: share.id,
				revokedAt: null,
				OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
			},
			data: { viewCount: { increment: 1 }, lastViewedAt: now },
		});
		if (count !== 1) {
			// Share became invalid between validation and write
			const recheck = await prisma.noteShare.findUnique({ where: { id: share.id } });
			if (!recheck) return { status: "not-found" };
			if (recheck.revokedAt) return { status: "revoked" };
			if (isExpired(recheck.expiresAt)) return { status: "expired" };
			// Should not reach here for non-viewOnce, but be defensive
			return { status: "not-found" };
		}
	}

	await logShareView(share.id, share.token);

	void trackSkriuwServer(
		"share_opened",
		{
			viewOnce: share.viewOnce,
			hasPassword: Boolean(share.passwordHash),
		},
		"/sharing/open",
	);

	return {
		status: "ok",
		snapshot: {
			name: share.name,
			content: share.content,
			richContent: (share.richContent as RichTextDocument | null) ?? null,
			preferredEditorMode: (share.preferredEditorMode as "raw" | "block") ?? "block",
			sharedAt: share.createdAt.toISOString(),
			author: share.authorName ?? null,
		},
	};
}
