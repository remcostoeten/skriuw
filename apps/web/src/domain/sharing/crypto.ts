import "server-only";

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const TOKEN_BYTES = 16; // 128 bits → ~22 url-safe chars
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

// Per-deployment salt so viewer hashes can't be correlated across installs or
// reversed via a rainbow table of common IP/UA pairs.
function getViewerHashSalt(): string {
	const salt = process.env.SHARE_VIEWER_SALT;
	if (salt) return salt;
	if (process.env.NODE_ENV === "production") {
		throw new Error("SHARE_VIEWER_SALT must be set in production");
	}
	return "skriuw-share-viewer-dev";
}

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
		.update(`${getViewerHashSalt()}|${parts.token}|${parts.ip ?? ""}|${parts.userAgent ?? ""}`)
		.digest("base64url")
		.slice(0, 22);
}

/** Unguessable, URL-safe share token. */
export function generateShareToken(): string {
	return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Hash a share password as `salt:hash` (hex). */
export async function hashSharePassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_BYTES);
	const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
	return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Constant-time verification of a password against a stored `salt:hash`. */
export async function verifySharePassword(password: string, stored: string): Promise<boolean> {
	const [saltHex, hashHex] = stored.split(":");
	if (!saltHex || !hashHex) return false;
	const salt = Buffer.from(saltHex, "hex");
	const expected = Buffer.from(hashHex, "hex");
	const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
	if (derived.length !== expected.length) return false;
	return timingSafeEqual(derived, expected);
}
