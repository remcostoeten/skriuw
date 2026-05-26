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
	/** When true, the public page credits the creator by name; otherwise anonymous. */
	showAuthor?: boolean;
};

export type TUpdateShareInput = {
	noteId: string;
	viewOnce: boolean;
	expiry: TShareExpiry;
	password?: TPasswordMutation;
	/** When true, the public page credits the creator by name; otherwise anonymous. */
	showAuthor?: boolean;
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
	/** Author name shown on the public page, or null when anonymous. */
	authorName: string | null;
	/** True when the live note diverged from the published snapshot. */
	isStale: boolean;
};

/** Lifecycle status of a share, derived for the owner overview. */
export type TSharedNoteStatus = "active" | "expired" | "revoked" | "consumed";

/** One day of the recurrence window. `date` is a UTC `YYYY-MM-DD` key. */
export type TViewBucket = { date: string; count: number };

/** A single shared note as shown in the owner's "Shared notes" overview. */
export type TSharedNoteRow = {
	noteId: string;
	token: string;
	url: string;
	path: string;
	name: string;
	status: TSharedNoteStatus;
	hasPassword: boolean;
	viewOnce: boolean;
	/** Author name shown on the public page, or null when shared anonymously. */
	authorName: string | null;
	/** True when the live note diverged from the published snapshot. */
	isStale: boolean;
	/** True when the underlying note has been moved to trash. */
	noteDeleted: boolean;
	createdAt: string;
	expiresAt: string | null;
	lastViewedAt: string | null;

	// ── Metrics ──────────────────────────────────────────────────────────
	/** Authoritative running total of opens (counted since the share existed). */
	totalViews: number;
	/** Logged opens within the recurrence window. */
	windowViews: number;
	/** Distinct viewer fingerprints within the window (approximate). */
	uniqueViewers: number;
	/** Earliest logged open, all-time. */
	firstViewedAt: string | null;
	/** Days within the window that saw at least one open. */
	activeDays: number;
	/** Daily buckets across the whole window (length === windowDays). */
	timeline: TViewBucket[];
	/** Busiest day within the window. */
	peak: TViewBucket | null;
};

export type TSharedOverviewSummary = {
	total: number;
	active: number;
	expired: number;
	revoked: number;
	consumed: number;
	/** Sum of authoritative view totals across all shares. */
	totalViews: number;
	/** Length of the recurrence window in days. */
	windowDays: number;
};

export type TSharedOverview = {
	rows: TSharedNoteRow[];
	summary: TSharedOverviewSummary;
};

/** Self-contained snapshot served to an unauthenticated viewer. */
export type TPublicShareSnapshot = {
	name: string;
	content: string;
	richContent: RichTextDocument | null;
	preferredEditorMode: "raw" | "block";
	sharedAt: string;
	/** Creator's name, shown as the author, or null when shared anonymously. */
	author: string | null;
};

/** Non-consuming probe result used by the public route's RSC. */
export type TPublicSharePeek =
	| {
			status: "ready";
			requiresPassword: boolean;
			viewOnce: boolean;
			name: string;
			description: string;
	  }
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
