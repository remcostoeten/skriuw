"use server";

import { trackSkriuwServer } from "./server-track";

type AuthMethod = "email" | "github";
type AuthAction = "signin" | "signup";

export async function logAuthCompleted(
	action: AuthAction,
	method: AuthMethod,
): Promise<void> {
	await trackSkriuwServer(`auth_${action}_completed`, { method }, "/auth");
}
