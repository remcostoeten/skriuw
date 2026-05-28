import { getServerUser } from "@/core/db";
import { isDemoGuestEmail, isDemoGuestModeEnabled } from "@/lib/demo-guest";
import { isTrialEmail, isTrialModeEnabled } from "@/lib/trial";

export async function WorkspaceModeBanner() {
	const { user } = await getServerUser();
	if (!user?.email) return null;

	if (isTrialModeEnabled() && isTrialEmail(user.email)) {
		return (
			<div
				role="status"
				className="border-b border-primary/20 bg-primary/5 px-4 py-2 text-center text-[12px] text-foreground/85"
			>
				Trial workspace — only you can see these notes in this browser. Sign up to keep
				them after this session expires.
			</div>
		);
	}

	if (isDemoGuestModeEnabled() && isDemoGuestEmail(user.email)) {
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

	return null;
}
