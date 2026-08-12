"use client";

import { useAuth } from "@/core/auth/use-auth";
import { notesKeys } from "./notes-keys";

export function useNotesCacheScope(): string {
	const auth = useAuth();
	return auth.phase === "authenticated" && auth.user
		? notesKeys.userScope(auth.user.id)
		: notesKeys.localScope();
}
