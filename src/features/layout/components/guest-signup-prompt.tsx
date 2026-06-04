"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { GUEST_SIGNUP_PROMPT_EVENT } from "@/core/workspace-backend";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";

/**
 * Listens for the engagement threshold event broadcast by the local (guest)
 * backend and shows a one-time, dismissable sign-up dialog. Re-fires whenever
 * the next threshold is crossed. Renders nothing for signed-in users because
 * the local backend never dispatches the event for them.
 */
export function GuestSignupPrompt() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		function handlePrompt() {
			setOpen(true);
		}
		window.addEventListener(GUEST_SIGNUP_PROMPT_EVENT, handlePrompt);
		return () => window.removeEventListener(GUEST_SIGNUP_PROMPT_EVENT, handlePrompt);
	}, []);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
						<Sparkles className="h-5 w-5" />
					</span>
					<DialogTitle>Enjoying the workspace?</DialogTitle>
					<DialogDescription>
						You&apos;re editing in a local demo — nothing is saved to the cloud yet.
						Create a free account to keep your notes, sync across devices, and unlock
						sharing, export, and AI.
					</DialogDescription>
				</DialogHeader>
				<div className="mt-2 flex items-center gap-2">
					<Link
						href="/sign-up"
						onClick={() => setOpen(false)}
						className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-foreground px-3 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90"
					>
						Create account
					</Link>
					<button
						type="button"
						onClick={() => setOpen(false)}
						className="inline-flex h-9 items-center justify-center rounded-md px-3 text-[13px] font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
					>
						Keep exploring
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
