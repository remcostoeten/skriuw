/**
 * Deletes expired ephemeral trial users and their data.
 *
 * Run with: bun run trial:cleanup
 * Schedule daily in cron / GitHub Actions when SKRIUW_TRIAL_MODE is enabled.
 */

import "dotenv/config";
import { TRIAL_EMAIL_DOMAIN } from "../src/lib/trial";
import { prisma } from "../src/lib/prisma";

function getMaxAgeHours(): number {
	const hours = Number(process.env.SKRIUW_TRIAL_MAX_AGE_HOURS ?? "48");
	return Number.isFinite(hours) && hours > 0 ? hours : 48;
}

async function main() {
	const cutoff = new Date(Date.now() - getMaxAgeHours() * 60 * 60 * 1000);

	const stale = await prisma.user.findMany({
		where: {
			email: { endsWith: `@${TRIAL_EMAIL_DOMAIN}` },
			createdAt: { lt: cutoff },
		},
		select: { id: true, email: true },
	});

	if (stale.length === 0) {
		console.log("No stale trial users to delete.");
		return;
	}

	for (const user of stale) {
		await prisma.user.delete({ where: { id: user.id } });
		console.log(`Deleted ${user.email}`);
	}

	console.log(`Removed ${stale.length} trial user(s) older than ${getMaxAgeHours()}h.`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
