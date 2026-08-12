"use client";

import { useAuth } from "@/core/auth/use-auth";

export function usePeopleScope(): string {
	const auth = useAuth();
	return auth.phase === "authenticated" && auth.user ? `user:${auth.user.id}` : "local";
}
