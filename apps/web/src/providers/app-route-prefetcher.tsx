"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/core/auth/use-auth";

const GUEST_APP_ROUTES = ["/app"] as const;
// Warm the full router cache for every workspace view the signed-in user can
// reach from the icon rail. `router.prefetch` fetches the complete route
// payload (data included, not just the loading.tsx boundary), and with
// `staleTimes.dynamic` set these stay reusable — so the first hop to any of
// these lands without replaying a skeleton.
const AUTHED_APP_ROUTES = ["/app", "/app/graph", "/app/journal", "/app/shared"] as const;

function scheduleIdle(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};

	const idleWindow = window as typeof window & {
		requestIdleCallback?: (
			callback: IdleRequestCallback,
			options?: IdleRequestOptions,
		) => number;
		cancelIdleCallback?: (handle: number) => void;
	};

	if (idleWindow.requestIdleCallback) {
		const handle = idleWindow.requestIdleCallback(callback, { timeout: 1500 });
		return () => idleWindow.cancelIdleCallback?.(handle);
	}

	const timeout = window.setTimeout(callback, 250);
	return () => window.clearTimeout(timeout);
}

export function AppRoutePrefetcher() {
	const auth = useAuth();
	const pathname = usePathname();
	const router = useRouter();

	useEffect(() => {
		if (!auth.isReady) return;

		const routes = auth.phase === "authenticated" ? AUTHED_APP_ROUTES : GUEST_APP_ROUTES;

		return scheduleIdle(() => {
			for (const href of routes) {
				if (href === pathname) continue;
				router.prefetch(href);
			}
		});
	}, [auth.isReady, auth.phase, pathname, router]);

	return null;
}
