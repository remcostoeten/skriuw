"use client";

import Link from "next/link";
import { Lock, Sparkles, Share2, Download } from "lucide-react";
import type { ReactNode } from "react";
import { useIsGuestWorkspace } from "@/core/workspace-backend";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";

export type GuestFeature = "share" | "export" | "ai" | "account";

type FeatureCopy = {
	icon: typeof Lock;
	title: string;
	description: string;
};

const FEATURE_COPY: Record<GuestFeature, FeatureCopy> = {
	share: {
		icon: Share2,
		title: "Sharing needs an account",
		description:
			"Create a free account to share notes by link, send to other apps, or collaborate.",
	},
	export: {
		icon: Download,
		title: "Export needs an account",
		description:
			"Sign up to export your workspace to a portable archive — vault.zip, markdown, or JSON.",
	},
	ai: {
		icon: Sparkles,
		title: "AI features need an account",
		description:
			"Sign up to use spell-check, continue-writing, and title generation with your own provider keys.",
	},
	account: {
		icon: Lock,
		title: "Sign in to continue",
		description: "This area is only available to signed-in users.",
	},
};

type GuestGateProps = {
	feature: GuestFeature;
	children: ReactNode;
	/**
	 * When true, the wrapped element is still visually shown but a transparent
	 * overlay captures the click and opens the sign-up popover. Default is true
	 * so triggers keep their styling and just become a CTA in guest mode.
	 */
	overlay?: boolean;
	/** Optional tighter alignment for the popover. */
	align?: "start" | "center" | "end";
};

/**
 * Wraps a trigger surface so that in guest mode it cannot be activated. The
 * child element stays visible (keeping its styling) but a transparent overlay
 * intercepts the click and opens a popover with a sign-up call-to-action.
 *
 * For signed-in users the wrapper is transparent — children render unchanged.
 */
export function GuestGate({ feature, children, overlay = true, align = "end" }: GuestGateProps) {
	const isGuest = useIsGuestWorkspace();
	if (!isGuest) return <>{children}</>;

	const copy = FEATURE_COPY[feature];
	const Icon = copy.icon;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<span className="relative inline-flex">
					<span
						className={cn(
							"contents",
							overlay && "pointer-events-none select-none opacity-60",
						)}
						aria-hidden={overlay ? undefined : "false"}
					>
						{children}
					</span>
					{overlay ? (
						<button
							type="button"
							aria-label={`${copy.title} — sign up to unlock`}
							className="absolute inset-0 cursor-pointer rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
						/>
					) : null}
				</span>
			</PopoverTrigger>
			<PopoverContent
				align={align}
				className="w-72 border-foreground/10 bg-popover/95 p-0 backdrop-blur"
			>
				<div className="flex items-start gap-3 p-4 pb-3">
					<span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
						<Icon className="h-4 w-4" />
					</span>
					<div className="space-y-1">
						<p className="text-[13px] font-medium text-foreground">{copy.title}</p>
						<p className="text-[12px] leading-relaxed text-muted-foreground">
							{copy.description}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2 border-t border-foreground/8 bg-foreground/[0.02] px-4 py-2.5">
					<Link
						href="/app?auth=sign-up"
						className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-foreground px-3 text-[12px] font-medium text-background transition-colors hover:bg-foreground/90"
					>
						Create account
					</Link>
					<Link
						href="/app?auth=sign-in"
						className="inline-flex h-8 items-center justify-center rounded-md px-3 text-[12px] font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
					>
						Sign in
					</Link>
				</div>
			</PopoverContent>
		</Popover>
	);
}

/**
 * Inline, panel-sized "sign up to use" card for whole sections that are
 * account-only (e.g. settings tabs). Purely presentational — callers decide
 * when to render it (typically gated on `useIsGuestWorkspace()`).
 */
export function GuestSectionNotice({ feature }: { feature: GuestFeature }) {
	const copy = FEATURE_COPY[feature];
	const Icon = copy.icon;

	return (
		<div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-5">
			<span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
				<Icon className="h-4 w-4" />
			</span>
			<div className="space-y-2">
				<div className="space-y-1">
					<p className="text-sm font-medium text-foreground">{copy.title}</p>
					<p className="text-[13px] leading-relaxed text-muted-foreground">
						{copy.description}
					</p>
				</div>
				<div className="flex items-center gap-2 pt-1">
					<Link
						href="/app?auth=sign-up"
						className="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-[12px] font-medium text-background transition-colors hover:bg-foreground/90"
					>
						Create account
					</Link>
					<Link
						href="/app?auth=sign-in"
						className="inline-flex h-8 items-center justify-center rounded-md px-3 text-[12px] font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
					>
						Sign in
					</Link>
				</div>
			</div>
		</div>
	);
}
