import type { RichTextDocument } from "@/domain/notes/models";

/**
 * How a share link expires. Resolved to an absolute instant before persisting
 * (see `resolveExpiry`), so the database only ever stores a `Date | null`.
 */
export type TShareExpiry =
	| { kind: "never" }
	| { kind: "duration"; ms: number }
	| { kind: "date"; iso: string };

/** Expiry presets surfaced in the share screen. */
export const SHARE_DURATION_PRESETS = [
	{ id: "5m", label: "5 minutes", ms: 5 * 60 * 1000 },
	{ id: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
	{ id: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
] as const;

export type TShareDurationPresetId = (typeof SHARE_DURATION_PRESETS)[number]["id"];

/**
 * Password mutation intent for update operations:
 * - `string` (non-empty) → set / replace the password
 * - `null` → remove the password
 * - `undefined` → leave the existing password untouched
 */
export type TPasswordMutation = string | null | undefined;

export type TPublishNoteInput = {
	noteId: string;
	viewOnce: boolean;
	expiry: TShareExpiry;
	password?: TPasswordMutation;
};

export type TUpdateShareInput = {
	noteId: string;
	viewOnce: boolean;
	expiry: TShareExpiry;
	password?: TPasswordMutation;
};

/** Owner-facing view of a note's share, returned to the share screen. */
export type TNoteShareState = {
	token: string;
	url: string;
	path: string;
	hasPassword: boolean;
	viewOnce: boolean;
	expiresAt: string | null;
	consumedAt: string | null;
	revokedAt: string | null;
	viewCount: number;
	lastViewedAt: string | null;
	createdAt: string;
	snapshotName: string;
	/** True when the live note diverged from the published snapshot. */
	isStale: boolean;
};

/** Self-contained snapshot served to an unauthenticated viewer. */
export type TPublicShareSnapshot = {
	name: string;
	content: string;
	richContent: RichTextDocument | null;
	preferredEditorMode: "raw" | "block";
	sharedAt: string;
};

/** Non-consuming probe result used by the public route's RSC. */
export type TPublicSharePeek =
	| { status: "ready"; requiresPassword: boolean; viewOnce: boolean; name: string }
	| { status: "expired" }
	| { status: "revoked" }
	| { status: "consumed" }
	| { status: "not-found" };

/** Consuming open result returned to the public viewer client. */
export type TPublicShareResult =
	| { status: "ok"; snapshot: TPublicShareSnapshot }
	| { status: "need-password" }
	| { status: "wrong-password" }
	| { status: "expired" }
	| { status: "revoked" }
	| { status: "consumed" }
	| { status: "not-found" };

/** Canonical public path for a share token. */
export function buildSharePath(token: string): string {
	return `/s/${token}`;
}
