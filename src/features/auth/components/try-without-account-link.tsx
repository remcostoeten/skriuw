import Link from "next/link";
import { isDemoGuestModeEnabled } from "@/lib/demo-guest";
import { isTrialModeEnabled } from "@/lib/trial";

export function TryWithoutAccountLink() {
	if (isTrialModeEnabled()) {
		return (
			<p className="mt-4 text-center text-[13px] text-muted-foreground">
				<Link
					href="/api/trial/enter?next=/app"
					className="font-medium text-foreground duration-200 hover:text-foreground/80"
				>
					Try Skriuw free
				</Link>
				<span className="text-muted-foreground/70"> — your own workspace, no account</span>
			</p>
		);
	}

	if (isDemoGuestModeEnabled()) {
		return (
			<p className="mt-4 text-center text-[13px] text-muted-foreground">
				<Link
					href="/api/demo-guest/enter?next=/app"
					className="font-medium text-foreground duration-200 hover:text-foreground/80"
				>
					Continue as demo guest
				</Link>
				<span className="text-muted-foreground/70"> — full app, shared sandbox</span>
			</p>
		);
	}

	return null;
}
