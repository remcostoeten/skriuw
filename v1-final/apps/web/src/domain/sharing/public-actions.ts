"use server";

import { z } from "zod";
import { openShare } from "./public";
import type { TPublicShareResult } from "./models";

const PUBLIC_SHARE_TOKEN_SCHEMA = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.regex(/^[A-Za-z0-9_-]+$/);
const PUBLIC_SHARE_PASSWORD_SCHEMA = z.string().max(128);

/**
 * Client-callable entry point for opening a public share. Wraps the isolated
 * resolver so the unauthenticated viewer never bundles server code directly.
 */
// react-doctor-disable-next-line react-doctor/server-auth-actions -- public share viewer endpoint; token/password are normalized and bounded before lookup.
export async function openPublicShare(input: {
	token: string;
	password?: string;
}): Promise<TPublicShareResult> {
	const tokenResult = PUBLIC_SHARE_TOKEN_SCHEMA.safeParse(input.token);
	if (!tokenResult.success) {
		return { status: "not-found" };
	}

	if (
		input.password !== undefined &&
		!PUBLIC_SHARE_PASSWORD_SCHEMA.safeParse(input.password).success
	) {
		return { status: "wrong-password" };
	}

	return openShare({
		token: tokenResult.data,
		password: input.password,
	});
}
