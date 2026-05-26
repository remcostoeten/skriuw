import type { TSharedNoteStatus } from "@/domain/sharing/models";

/** Compact relative time: "just now", "5m ago", "2h ago", "3d ago", else date. */
export function formatRelativeTime(iso: string | null): string {
	if (!iso) return "—";
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "—";
	const diff = Date.now() - then;
	const sec = Math.round(diff / 1000);
	if (sec < 45) return "just now";
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.round(hr / 24);
	if (day < 7) return `${day}d ago`;
	const wk = Math.round(day / 7);
	if (wk < 5) return `${wk}w ago`;
	return formatDate(iso);
}

/** Short absolute date, e.g. "May 12, 2026". */
export function formatDate(iso: string | null): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/** Time until expiry, framed for an owner: "in 3d", "in 5h", or "expired". */
export function formatExpiry(iso: string | null): string {
	if (!iso) return "Never";
	const ms = new Date(iso).getTime() - Date.now();
	if (Number.isNaN(ms)) return "Never";
	if (ms <= 0) return "Expired";
	const min = Math.max(1, Math.ceil(ms / 60000));
	if (min < 60) return `in ${min}m`;
	const hr = Math.max(1, Math.ceil(min / 60));
	if (hr < 24) return `in ${hr}h`;
	const day = Math.max(1, Math.ceil(hr / 24));
	return `in ${day}d`;
}

/** Span between first and last view, e.g. "6 days", "1 day", "—". */
export function formatSpan(firstIso: string | null, lastIso: string | null): string {
	if (!firstIso || !lastIso) return "—";
	const ms = new Date(lastIso).getTime() - new Date(firstIso).getTime();
	if (Number.isNaN(ms) || ms < 0) return "—";
	const days = Math.max(1, Math.round(ms / 86_400_000));
	return days === 1 ? "1 day" : `${days} days`;
}

type StatusStyle = { label: string; className: string; dot: string };

const STATUS_STYLES: Record<TSharedNoteStatus, StatusStyle> = {
	active: {
		label: "Active",
		className: "border-success/30 bg-success/10 text-success",
		dot: "bg-success",
	},
	expired: {
		label: "Expired",
		className: "border-warning/30 bg-warning/10 text-warning",
		dot: "bg-warning",
	},
	revoked: {
		label: "Revoked",
		className: "border-destructive/30 bg-destructive/10 text-destructive",
		dot: "bg-destructive",
	},
	consumed: {
		label: "Consumed",
		className: "border-border bg-muted text-muted-foreground",
		dot: "bg-muted-foreground",
	},
};

export function statusStyle(status: TSharedNoteStatus): StatusStyle {
	return STATUS_STYLES[status];
}
