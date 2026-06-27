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

		const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as TCollabTokenPayload;
		if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
		if (!payload.noteId || !payload.userId) return null;

		return payload;
	} catch {
		return null;
	}
}

/**
 * Deterministic, pleasant cursor color derived from a user id, returned as a
 * 6-digit hex string (`#RRGGBB`). Hex — not `hsl()` — is required because
 * y-prosemirror builds remote text-selection highlights by appending an alpha
 * byte (`${color}70`), which only yields a valid CSS color for hex inputs, and
 * BlockNote's caret contrast check parses the color as hex too.
 */
export function collabColorForUser(userId: string): string {
	let hash = 0;
	for (let i = 0; i < userId.length; i += 1) {
		hash = (hash << 5) - hash + userId.charCodeAt(i);
		hash |= 0;
	}
	const hue = Math.abs(hash) % 360;
	return hslToHex(hue, 70, 60);
}

function hslToHex(h: number, s: number, l: number): string {
	const sat = s / 100;
	const light = l / 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = sat * Math.min(light, 1 - light);
	const f = (n: number) => {
		const color = light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
		return Math.round(255 * color)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}
