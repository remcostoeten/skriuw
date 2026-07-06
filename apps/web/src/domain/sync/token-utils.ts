import { randomBytes } from "node:crypto";

export const SYNC_READ_SCOPE = "sync:read" as const;
export const SYNC_WRITE_SCOPE = "sync:write" as const;

export type SyncScope = typeof SYNC_READ_SCOPE | typeof SYNC_WRITE_SCOPE;

const TOKEN_PREFIX = "skriuw_sync";
const TOKEN_BYTES = 32;
export const MAX_SYNC_TOKEN_NAME_LENGTH = 80;

export function createRawSyncToken(): string {
	return `${TOKEN_PREFIX}_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

export function readBearerToken(request: Request): string | null {
	const header = request.headers.get("authorization");
	if (!header) return null;
	const [scheme, token] = header.split(/\s+/, 2);
	if (scheme?.toLowerCase() !== "bearer" || !token) return null;
	return token;
}
