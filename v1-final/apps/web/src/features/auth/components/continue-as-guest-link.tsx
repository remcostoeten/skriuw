import Link from "next/link";

export function ContinueAsGuestLink() {
	return (
		<p className="mt-4 text-center text-[13px] text-muted-foreground">
			<Link
				href="/app"
				className="font-medium text-foreground duration-200 hover:text-foreground/80"
			>
				Try Skriuw free
			</Link>
			<span className="text-muted-foreground/70"> — explore a demo, no account</span>
		</p>
	);
}
