"use client";

import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";
import {
	subscribeUserToast,
	type UserToast,
	type UserToastVariant,
} from "@/shared/lib/user-toast";

const variantClass: Record<UserToastVariant, string> = {
	success: "border-emerald-500/25 bg-emerald-500/10 text-foreground",
	error: "border-destructive/30 bg-destructive/10 text-foreground",
	info: "border-border bg-card text-foreground",
};

export function UserToastHost() {
	const [toast, setToast] = useState<UserToast | null>(null);

	useEffect(() => subscribeUserToast(setToast), []);

	if (!toast) return null;

	return (
		<div
			role="status"
			aria-live="polite"
			aria-atomic="true"
			className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[100] flex justify-center px-4"
		>
			<div
				className={cn(
					"max-w-sm rounded-xl border px-4 py-2.5 text-center text-[13px] font-medium shadow-lg backdrop-blur-sm",
					variantClass[toast.variant],
				)}
			>
				{toast.message}
			</div>
		</div>
	);
}
