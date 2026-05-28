import { getServerUser } from "@/core/db";
import { isDemoGuestEmail, isDemoGuestModeEnabled } from "@/lib/demo-guest";

export async function DemoGuestBanner() {
	if (!isDemoGuestModeEnabled()) return null;

	const { user } = await getServerUser();
	if (!isDemoGuestEmail(user?.email)) return null;

	return (
		<div
			role="status"
			className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-[12px] text-foreground/85"
		>
			Demo guest mode — this workspace is shared. Anyone with the link can view and
			edit.
		</div>
	);
}
