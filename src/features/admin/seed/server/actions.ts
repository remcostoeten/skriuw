"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/features/admin/guards/require-admin";
import { prisma } from "@/lib/prisma";
import type { SeedBundlePayload } from "../types";

const ADMIN_SEED_ROUTE = "/admin/seed";

type SaveBundleInput = {
	id: string;
	name: string;
	payload: SeedBundlePayload;
};

/**
 * Persist the full bundle payload in a single row update. Save is publish in
 * v1 — there is no draft/published split. localStorage-backed drafts on the
 * client absorb the tab-close risk.
 */
export async function saveSeedBundle(input: SaveBundleInput): Promise<void> {
	const { user } = await requireAdmin();

	await prisma.seedBundle.update({
		where: { id: input.id },
		data: {
			name: input.name,
			folders: input.payload.folders as unknown as Prisma.InputJsonValue,
			notes: input.payload.notes as unknown as Prisma.InputJsonValue,
			tags: input.payload.tags as unknown as Prisma.InputJsonValue,
			journals: input.payload.journals as unknown as Prisma.InputJsonValue,
			updatedBy: user.id,
		},
	});

	revalidatePath(ADMIN_SEED_ROUTE);
}
