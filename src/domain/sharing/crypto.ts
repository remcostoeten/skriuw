import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 16; // 128 bits → ~22 url-safe chars
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

// Per-deployment salt so viewer hashes can't be correlated across installs or
// reversed via a rainbow table of common IP/UA pairs.
const VIEWER_HASH_SALT = process.env.SHARE_VIEWER_SALT ?? "skriuw-share-viewer";

/**
 * Stable, non-reversible fingerprint of a viewer for a given share. Combines
 * IP + user-agent + share token with a salt; stored instead of any PII so we
 * can approximate unique-viewer counts without retaining addresses.
 */
export function hashViewer(parts: {
	ip: string | null;
	userAgent: string | null;
	token: string;
}): string {
	return createHash("sha256")
		.update(`${VIEWER_HASH_SALT}|${parts.token}|${parts.ip ?? ""}|${parts.userAgent ?? ""}`)
		.digest("base64url")
		.slice(0, 22);
}

/** Unguessable, URL-safe share token. */
export function generateShareToken(): string {
	return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Hash a share password as `salt:hash` (hex). */
export function hashSharePassword(password: string): string {
	const salt = randomBytes(SALT_BYTES);
	const derived = scryptSync(password, salt, KEY_LENGTH);
	return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Constant-time verification of a password against a stored `salt:hash`. */
export function verifySharePassword(password: string, stored: string): boolean {
	const [saltHex, hashHex] = stored.split(":");
	if (!saltHex || !hashHex) return false;
	const salt = Buffer.from(saltHex, "hex");
	const expected = Buffer.from(hashHex, "hex");
	const derived = scryptSync(password, salt, expected.length);
	if (derived.length !== expected.length) return false;
	return timingSafeEqual(derived, expected);
}
