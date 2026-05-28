/**
 * Provisions the shared demo guest account and seeds starter content.
 *
 * Run with: bun run demo-guest:ensure
 * Requires SKRIUW_DEMO_GUEST_MODE=true (or pass for one-off setup).
 */

import "dotenv/config";
import { ensureDemoGuestUser } from "../src/core/demo-guest/ensure-user";
import { getDemoGuestCredentials, isDemoGuestModeEnabled } from "../src/lib/demo-guest";

async function main() {
	if (!isDemoGuestModeEnabled()) {
		console.error("Set SKRIUW_DEMO_GUEST_MODE=true in .env first.");
		process.exit(1);
	}

	const { email, password } = getDemoGuestCredentials();
	const { userId } = await ensureDemoGuestUser();

	console.log("Demo guest ready.");
	console.log(`  user id: ${userId}`);
	console.log(`  email:   ${email}`);
	console.log(`  password: ${password}`);
	console.log("");
	console.log("Share with external viewers:");
	console.log("  1. Start the app with SKRIUW_DEMO_GUEST_MODE=true");
	console.log("  2. Open /app (auto sign-in) or /api/demo-guest/enter");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
