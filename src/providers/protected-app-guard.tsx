"use client";

import { useQueryClient } from "@tanstack/react-query";
import { startTransition, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/core/auth/use-auth";

type ProtectedAppGuardProps = {
	children: React.ReactNode;
};

export function ProtectedAppGuard({ children }: ProtectedAppGuardProps) {
	const pathname = usePathname();
	const auth = useAuth();
	const queryClient = useQueryClient();
	const router = useRouter();

	const isProtectedRoute = pathname.startsWith("/app");

	useEffect(() => {
		if (!isProtectedRoute || !auth.isReady || auth.phase === "authenticated") {
			return;
		}

		queryClient.clear();
		startTransition(() => {
			router.replace("/sign-in");
		});
	}, [auth.isReady, auth.phase, isProtectedRoute, queryClient, router]);

	if (isProtectedRoute && auth.isReady && auth.phase !== "authenticated") {
		return null;
	}

	return <>{children}</>;
}
