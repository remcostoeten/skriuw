import Link from "next/link";
import { Sparkles } from "lucide-react";

export function GuestBanner() {
	return (
		<div
			role="status"
			className="flex shrink-0 items-center justify-center gap-2 border-b border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 px-4 py-2 text-[12px] text-foreground/85"
		>
			<Sparkles className="size-3.5 text-primary" aria-hidden />
			<span>You're exploring a demo workspace — changes stay in this browser.</span>
			<Link
				href="/app?auth=sign-up"
				className="font-medium text-foreground underline-offset-4 hover:underline"
			>
				Create an account to save your work
			</Link>
		</div>
	);
}
