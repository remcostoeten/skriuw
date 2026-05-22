"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { RecentItem, RecentItemType } from "@/domain/recents/types";

const MAX_RECENTS = 10;

export async function listRecents(): Promise<RecentItem[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.userRecent.findMany({
		where: { userId: user.id },
		orderBy: { accessedAt: "desc" },
		take: MAX_RECENTS,
	});
	return records.map((record) => ({
		id: record.itemId,
		itemId: record.itemId,
		itemType: record.itemType as RecentItemType,
		accessedAt: record.accessedAt,
	}));
}

export async function trackRecent(itemId: string, itemType: RecentItemType): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	await prisma.userRecent.upsert({
		where: { userId_itemId: { userId: user.id, itemId } },
		create: {
			userId: user.id,
			itemId,
			itemType,
			accessedAt: new Date(),
		},
		update: {
			itemType,
			accessedAt: new Date(),
		},
	});
}

export async function clearRecents(): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	await prisma.userRecent.deleteMany({
		where: { userId: user.id },
	});
}
