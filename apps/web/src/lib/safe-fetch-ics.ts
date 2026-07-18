import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MAX_ICS_IMPORT_BYTES } from "@/domain/journal/ics-import";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

/**
 * Validates and normalizes a user-supplied calendar subscription URL.
 * Accepts `https://` and `webcal://` (rewritten to https). Throws a
 * user-safe `Error` for anything else.
 */
export function normalizeSubscriptionUrl(raw: string): string {
	const rewritten = raw.trim().replace(/^webcal:\/\//i, "https://");
	let url: URL;
	try {
		url = new URL(rewritten);
	} catch {
		throw new Error("That is not a valid URL.");
	}
	if (url.protocol !== "https:") {
		throw new Error("Only https:// (or webcal://) calendar URLs are supported.");
	}
	if (url.username || url.password) {
		throw new Error("Calendar URLs with embedded credentials are not supported.");
	}
	if (!url.hostname.includes(".")) {
		throw new Error("That host cannot be used for a calendar subscription.");
	}
	return url.toString();
}

function isPrivateIpv4(ip: string): boolean {
	const parts = ip.split(".").map(Number);
	const [a, b] = parts;
	if (a === 10 || a === 127 || a === 0) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 169 && b === 254) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	return false;
}

function isPrivateIpv6(ip: string): boolean {
	const lower = ip.toLowerCase();
	if (lower === "::" || lower === "::1") return true;
	if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
	const v4 = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (v4) return isPrivateIpv4(v4[1]);
	return false;
}

/** SSRF guard: true when the address is loopback, link-local, or otherwise internal. */
export function isPrivateAddress(ip: string): boolean {
	const family = isIP(ip);
	if (family === 4) return isPrivateIpv4(ip);
	if (family === 6) return isPrivateIpv6(ip);
	return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
	const blocked = new Error("That host cannot be used for a calendar subscription.");
	if (isIP(hostname) || isIP(hostname.replace(/^\[|\]$/g, ""))) {
		if (isPrivateAddress(hostname.replace(/^\[|\]$/g, ""))) throw blocked;
		return;
	}
	let addresses: Array<{ address: string }>;
	try {
		addresses = await lookup(hostname, { all: true });
	} catch {
		throw new Error("The calendar host could not be resolved.");
	}
	if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
		throw blocked;
	}
}

async function readBodyCapped(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return "";
	const chunks: Uint8Array[] = [];
	let received = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > MAX_ICS_IMPORT_BYTES) {
			await reader.cancel();
			throw new Error("The calendar file is too large — the limit is 5 MB.");
		}
		chunks.push(value);
	}
	const merged = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder("utf-8").decode(merged);
}

/**
 * Fetches an external ICS URL with SSRF protections: https-only, resolved
 * addresses must be public (re-checked on every redirect hop), 15s timeout,
 * and a 5 MB streamed response cap. Returns the calendar text.
 */
export async function fetchIcsFromUrl(rawUrl: string): Promise<string> {
	let current = normalizeSubscriptionUrl(rawUrl);
	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		const url = new URL(current);
		await assertPublicHost(url.hostname);
		const response = await fetch(current, {
			redirect: "manual",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
			cache: "no-store",
		});
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location");
			if (!location) throw new Error("The calendar host sent an invalid redirect.");
			current = normalizeSubscriptionUrl(new URL(location, current).toString());
			continue;
		}
		if (!response.ok) {
			throw new Error(`The calendar host responded with status ${response.status}.`);
		}
		return readBodyCapped(response);
	}
	throw new Error("The calendar URL redirected too many times.");
}
