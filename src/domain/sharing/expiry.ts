import type { TShareExpiry } from "./models";

/** Resolve an expiry intent into an absolute instant (or null for "never"). */
export function resolveExpiry(expiry: TShareExpiry, now: Date = new Date()): Date | null {
	switch (expiry.kind) {
		case "never":
			return null;
		case "duration":
			return new Date(now.getTime() + expiry.ms);
		case "date": {
			const parsed = new Date(expiry.iso);
			return Number.isNaN(parsed.getTime()) ? null : parsed;
		}
	}
}

/** Whether an expiry instant has passed. */
export function isExpired(expiresAt: Date | null | undefined, now: Date = new Date()): boolean {
	return expiresAt != null && expiresAt.getTime() <= now.getTime();
}
