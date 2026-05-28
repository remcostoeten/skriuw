"use server";

import { cache } from "react";
import { getAuthenticatedUser } from "@/core/db";
import { ensureStarterContentForUserId } from "@/domain/seed/provision";

/**
 * Seeds a fresh user's workspace from the active SeedBundle row in the DB.
 *
 * Behavior:
 * - If `starterSeededAt` is set on the user, returns immediately (single field
 *   check; zero extra queries on repeat page loads).
 * - If no SeedBundle is marked active, returns immediately.
 * - Otherwise clones folders + notes (+ tags, journals) into the user's
 *   workspace in a single transaction, then stamps `starterSeededAt`.
 */
export const ensureCloudStarterContentSeeded = cache(async function ensureCloudStarterContentSeeded(): Promise<void> {
	const { user } = await getAuthenticatedUser();
	await ensureStarterContentForUserId(user.id);
});
