import "server-only";

import { redirect } from "next/navigation";
import { getServerUser } from "@/core/db";
import { isAdmin } from "@/lib/roles";

/**
 * Server-side guard for admin routes and admin-only mutations.
 *
 * In route layouts/pages: throws via `redirect()` to `/app` when the caller is
 * unauthenticated or not an admin. Returns the user when allowed.
 *
 * In server actions: prefer to call this at the top so the action throws
 * before touching any data. The `redirect()` path is harmless in actions —
 * Next.js converts it into the appropriate redirect response.
 */
export async function requireAdmin() {
	const { user } = await getServerUser();
	if (!user || !isAdmin(user.role)) {
		redirect("/app");
	}
	return { user };
}
