import Link from "next/link";
import { isDemoGuestModeEnabled } from "@/lib/demo-guest";

export function DemoGuestSignInLink() {
	if (!isDemoGuestModeEnabled()) return null;

	return (
		<p className="mt-4 text-center text-[13px] text-muted-foreground">
			<Link
				href="/api/demo-guest/enter?next=/app"
				className="font-medium text-foreground duration-200 hover:text-foreground/80"
			>
				Continue as demo guest
			</Link>
			<span className="text-muted-foreground/70"> — full app, no account</span>
		</p>
	);
}
