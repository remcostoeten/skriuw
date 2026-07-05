// HMAC-signed, short-lived token authorizing a single collaboration room.
//
// This module is imported from TWO runtimes:
//   - the Next.js room-auth route (Node)         → signs the token
//   - the PartyKit server (`party/notes.ts`, workerd) → verifies the token
//
// It therefore uses ONLY the Web Crypto API (available in both) and avoids
// `node:crypto`, `server-only`, and the `@/` path alias — PartyKit's esbuild
// bundle resolves it by relative path and would choke on any of those.

export type TCollabRole = "owner" | "editor" | "viewer";

export type TCollabTokenPayload = {
	/** The note id; must equal the PartyKit room id the holder connects to. */
	noteId: string;
	/** The authenticated user this token was minted for. */
	userId: string;
	/** Display name shown to other collaborators. */
	name: string;
	/** Cursor/presence color (CSS color string). */
	color: string;
	/** The holder's resolved role on the note. */
	role: TCollabRole;
	/** Expiry as epoch milliseconds. */
	exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

/** Sign a payload into a `<base64url(json)>.<base64url(hmac)>` token. */
export async function signCollabToken(
	payload: TCollabTokenPayload,
	secret: string,
): Promise<string> {
	const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const key = await importKey(secret);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
	return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verify a token's signature and expiry. Returns the payload when valid, or
 * null for any failure (bad shape, bad signature, expired). Never throws.
 */
export async function verifyCollabToken(
	token: string,
	secret: string,
): Promise<TCollabTokenPayload | null> {
	try {
		const [body, signature] = token.split(".");
		if (!body || !signature) return null;

		const key = await importKey(secret);
		const valid = await crypto.subtle.verify(
			"HMAC",
			key,
			fromBase64Url(signature) as BufferSource,
			encoder.encode(body),
		);
		if (!valid) return null;

		let payload: unknown;
		try {
			payload = JSON.parse(decoder.decode(fromBase64Url(body)));
		} catch (err) {
			console.error("[decodeCollabToken] Failed to parse payload:", err);
			return null;
		}
		if (typeof payload !== "object" || payload === null) return null;
		const typed = payload as Record<string, unknown>;
		if (typeof typed.exp !== "number" || typed.exp < Date.now()) return null;
		if (!typed.noteId || !typed.userId) return null;

		return typed as TCollabTokenPayload;
	} catch (err) {
		console.error("[decodeCollabToken] Token validation failed:", err);
		return null;
	}
}

/**
 * Fixed avatar / cursor color palette. Concrete 6-digit hex values — never CSS
 * variables — so a color can be persisted once at signup and rendered
 * identically across themes, devices, and the BlockNote/y-prosemirror caret
 * renderer (which appends an alpha byte, `${color}70`, that only yields a valid
 * CSS color for hex inputs, and whose contrast check parses the color as hex).
 *
 * Lives here, not under `@/shared`, because this module is the single place
 * imported by BOTH the web app and the PartyKit worker bundle — and the worker
 * bundle cannot resolve the `@/` alias.
 */
export const AVATAR_PALETTE = [
	"#e0598b",
	"#d98a2b",
	"#3b82f6",
	"#e8742f",
	"#22a565",
	"#9b59e0",
	"#13a3b5",
	"#d6453f",
] as const;

function paletteIndex(seed: string): number {
	let hash = 0;
	for (let i = 0; i < seed.length; i += 1) {
		hash = (hash << 5) - hash + seed.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash) % AVATAR_PALETTE.length;
}

/**
 * Deterministic avatar / cursor color for a stable seed (canonically the user
 * id). Maps the seed into {@link AVATAR_PALETTE} so the same seed always
 * resolves to the same hex string — this is the one derivation every surface
 * (DB signup default, collaboration cursors, avatar faces) shares.
 */
export function deriveAvatarColor(seed: string): string {
	return AVATAR_PALETTE[paletteIndex(seed)] ?? AVATAR_PALETTE[0];
}
