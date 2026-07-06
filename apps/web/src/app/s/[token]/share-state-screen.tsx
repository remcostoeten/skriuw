import Link from "next/link";
import { Clock, EyeOff, FileQuestion, ShieldX } from "lucide-react";
import type { ReactNode } from "react";

type TerminalStatus = "expired" | "revoked" | "consumed" | "not-found";

const COPY: Record<TerminalStatus, { icon: ReactNode; title: string; body: string }> = {
	expired: {
		icon: <Clock className="h-6 w-6" strokeWidth={1.6} />,
		title: "This link has expired",
		body: "The owner set this shared note to expire, and that time has passed.",
	},
	revoked: {
		icon: <ShieldX className="h-6 w-6" strokeWidth={1.6} />,
		title: "This link was turned off",
		body: "The owner has unpublished this note. It is no longer publicly viewable.",
	},
	consumed: {
		icon: <EyeOff className="h-6 w-6" strokeWidth={1.6} />,
		title: "This link was view-once",
		body: "The note has already been viewed and is no longer available.",
	},
	"not-found": {
		icon: <FileQuestion className="h-6 w-6" strokeWidth={1.6} />,
		title: "Nothing here",
		body: "This share link is invalid or no longer exists.",
	},
};

/** Centered, app-chrome-free shell shared by every public share screen. */
export function ShareShell({ children }: { children: ReactNode }) {
	return (
		<main className="flex min-h-dvh flex-col bg-background text-foreground">
			<div className="flex flex-1 items-center justify-center px-6 py-16 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))]">
				{children}
			</div>
			<footer className="border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-[11px] text-muted-foreground/70">
				Shared with{" "}
				<Link
					href="/"
					className="font-medium text-foreground/80 transition-colors hover:text-foreground"
				>
					Skriuw
				</Link>
			</footer>
		</main>
	);
}

export function ShareStateScreen({ status }: { status: TerminalStatus }) {
	const copy = COPY[status];
	return (
		<ShareShell>
			<div className="flex max-w-sm flex-col items-center text-center">
				<div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
					{copy.icon}
				</div>
				<h1 className="mt-5 text-lg font-semibold tracking-[-0.01em]">{copy.title}</h1>
				<p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
				<Link
					href="/"
					className="mt-6 inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-[13px] font-medium transition-colors hover:bg-muted"
				>
					Go to Skriuw
				</Link>
			</div>
		</ShareShell>
	);
}
