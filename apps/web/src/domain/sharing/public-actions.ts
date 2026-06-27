"use server";

import { openShare } from "./public";
import type { TPublicShareResult } from "./models";

/**
 * Client-callable entry point for opening a public share. Wraps the isolated
 * resolver so the unauthenticated viewer never bundles server code directly.
 */
export async function openPublicShare(input: {
	token: string;
	password?: string;
}): Promise<TPublicShareResult> {
	return openShare(input);
}
