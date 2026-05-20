"use client";

import { useQueryClient } from "@tanstack/react-query";
import { startTransition, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { initializeAuth } from "@/platform/auth";
import { useAuthSnapshot } from "@/platform/auth/use-auth";

type ProtectedAppGuardProps = {
	children: React.ReactNode;
};

export function ProtectedAppGuard({ children }: ProtectedAppGuardProps) {
	const pathname = usePathname();
	const auth = useAuthSnapshot();
	const queryClient = useQueryClient();
	const router = useRouter();
	const [hasInitializedAuth, setHasInitializedAuth] = useState(false);

	const isProtectedRoute = pathname.startsWith("/app");

	useEffect(() => {
		if (!isProtectedRoute) return;
		let isActive = true;

		void initializeAuth().finally(() => {
			if (isActive) {
				setHasInitializedAuth(true);
			}
		});

		return () => {
			isActive = false;
		};
	}, [isProtectedRoute]);

	useEffect(() => {
		if (!isProtectedRoute || !hasInitializedAuth || auth.phase === "authenticated") {
			return;
		}

		queryClient.clear();
		startTransition(() => {
			router.replace("/sign-in");
		});
	}, [auth.phase, hasInitializedAuth, isProtectedRoute, queryClient, router]);

	if (isProtectedRoute && hasInitializedAuth && auth.phase !== "authenticated") {
		return null;
	}

	return <>{children}</>;
}
