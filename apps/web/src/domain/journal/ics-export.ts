import { isDateKey } from "@skriuw/domain/journal";
import type { JournalEntry, MoodLevel } from "@/domain/journal/models";
import { extractRichDocumentPersonIds } from "@/domain/notes/rich-document";

const MOOD_LABELS: Record<MoodLevel, string> = {
	great: "Great",
	good: "Good",
	neutral: "Neutral",
	low: "Low",
	rough: "Rough",
};

type IcsExportOptions = {
	/** Inclusive `YYYY-MM-DD` bounds; omit either side for an open range. */
	from?: string;
	to?: string;
	/** Resolves a person mention id to a display name; unresolved ids are skipped. */
	resolvePersonName?: (id: string) => string | null | undefined;
};

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines. */
function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 line folding: content lines are capped at 75 octets, continuation
 * lines start with a single space. Splits on UTF-8 byte length so multi-byte
 * characters never straddle a fold.
 */
function foldIcsLine(line: string): string {
	const encoder = new TextEncoder();
	if (encoder.encode(line).length <= 75) return line;

	const folded: string[] = [];
	let current = "";
	let currentBytes = 0;
	let limit = 75;
	for (const char of line) {
		const charBytes = encoder.encode(char).length;
		if (currentBytes + charBytes > limit) {
			folded.push(current);
			current = " ";
			currentBytes = 1;
			limit = 75;
		}
		current += char;
		currentBytes += charBytes;
	}
	if (current) folded.push(current);
	return folded.join("\r\n");
}

function toIcsDate(dateKey: string): string {
	return dateKey.replaceAll("-", "");
}

function nextDayIcsDate(dateKey: string): string {
	const date = new Date(`${dateKey}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function toIcsTimestamp(date: Date): string {
	return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/**
 * DTSTAMP source with fallbacks: `updatedAt`, then `createdAt`, then "now" —
 * so an entry with a corrupt timestamp still serializes as a valid VEVENT.
 */
function entryTimestamp(entry: JournalEntry): string {
	for (const candidate of [entry.updatedAt, entry.createdAt]) {
		const date = new Date(candidate);
		if (Number.isFinite(date.getTime())) return toIcsTimestamp(date);
	}
	return toIcsTimestamp(new Date());
}

function buildDescription(
	entry: JournalEntry,
	resolvePersonName?: IcsExportOptions["resolvePersonName"],
): string {
	const people = extractRichDocumentPersonIds(entry.richContent ?? [])
		.map((id) => resolvePersonName?.(id))
		.filter((name): name is string => Boolean(name));

	const frontmatter: string[] = [];
	if (entry.mood) frontmatter.push(`mood: ${MOOD_LABELS[entry.mood]}`);
	if (entry.tags.length > 0) frontmatter.push(`tags: ${entry.tags.join(", ")}`);
	if (people.length > 0) frontmatter.push(`people: ${people.join(", ")}`);

	const parts: string[] = [];
	if (frontmatter.length > 0) {
		parts.push(["---", ...frontmatter, "---"].join("\n"));
	}
	const body = entry.content.trim();
	if (body) parts.push(body);
	return parts.join("\n\n");
}

function buildSummary(entry: JournalEntry): string {
	const title = entry.title?.trim();
	const base = title || `Journal — ${entry.dateKey}`;
	return entry.mood ? `${base} (${MOOD_LABELS[entry.mood]})` : base;
}

export function filterEntriesByRange(
	entries: JournalEntry[],
	from?: string,
	to?: string,
): JournalEntry[] {
	return entries.filter(
		(entry) => (!from || entry.dateKey >= from) && (!to || entry.dateKey <= to),
	);
}

/**
 * Serializes journal entries as an iCalendar (RFC 5545) document of all-day
 * events, one VEVENT per entry. Mood, tags, and people mentions ride in the
 * DESCRIPTION as a frontmatter-style intro above the entry body. The output
 * imports directly into Apple Calendar, Outlook, and Google Calendar.
 */
export function buildJournalIcs(entries: JournalEntry[], options: IcsExportOptions = {}): string {
	const selected = filterEntriesByRange(entries, options.from, options.to)
		.filter((entry) => isDateKey(entry.dateKey))
		.toSorted((a, b) => a.dateKey.localeCompare(b.dateKey) || a.id.localeCompare(b.id));

	const lines: string[] = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Skriuw//Journal//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"X-WR-CALNAME:Skriuw Journal",
	];

	for (const entry of selected) {
		lines.push(
			"BEGIN:VEVENT",
			`UID:${escapeIcsText(entry.id)}@skriuw`,
			`DTSTAMP:${entryTimestamp(entry)}`,
			`DTSTART;VALUE=DATE:${toIcsDate(entry.dateKey)}`,
			`DTEND;VALUE=DATE:${nextDayIcsDate(entry.dateKey)}`,
			`SUMMARY:${escapeIcsText(buildSummary(entry))}`,
		);
		const description = buildDescription(entry, options.resolvePersonName);
		if (description) {
			lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
		}
		if (entry.tags.length > 0) {
			lines.push(`CATEGORIES:${entry.tags.map(escapeIcsText).join(",")}`);
		}
		lines.push("END:VEVENT");
	}

	lines.push("END:VCALENDAR");
	return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
