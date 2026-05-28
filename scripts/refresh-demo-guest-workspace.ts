/**
 * Re-seeds the demo guest workspace from the active bundle (after bundle fixes).
 *
 * Run with: bun scripts/refresh-demo-guest-workspace.ts
 * Requires SKRIUW_DEMO_GUEST_MODE=true and DATABASE_URL.
 */

import "dotenv/config";
import { findDemoGuestUserId } from "../src/core/demo-guest/ensure-user";
import { ensureStarterContentForUserId } from "../src/domain/seed/provision";
import { getDemoGuestCredentials, isDemoGuestModeEnabled } from "../src/lib/demo-guest";
import { prisma } from "../src/lib/prisma";

async function main() {
	if (!isDemoGuestModeEnabled()) {
		console.error("Set SKRIUW_DEMO_GUEST_MODE=true in .env first.");
		process.exit(1);
	}

	const userId = await findDemoGuestUserId();
	if (!userId) {
		console.error(`Demo user ${getDemoGuestCredentials().email} not found. Run demo-guest:ensure.`);
		process.exit(1);
	}

	await prisma.$transaction([
		prisma.noteVersion.deleteMany({ where: { userId } }),
		prisma.noteShare.deleteMany({ where: { userId } }),
		prisma.note.deleteMany({ where: { userId } }),
		prisma.folder.deleteMany({ where: { userId } }),
		prisma.journalEntry.deleteMany({ where: { userId } }),
		prisma.journalTag.deleteMany({ where: { userId } }),
		prisma.user.update({ where: { id: userId }, data: { starterSeededAt: null } }),
	]);

	await ensureStarterContentForUserId(userId);
	console.log("Demo guest workspace refreshed.");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
