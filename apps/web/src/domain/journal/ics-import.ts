import { MOOD_OPTIONS, isDateKey, isMoodLevel, type MoodLevel } from "@skriuw/domain/journal";
import { normalizeTagName } from "@/domain/tags/normalize";

export const MAX_ICS_IMPORT_BYTES = 5 * 1024 * 1024;

const SKRIUW_UID_SUFFIX = "@skriuw";

const MOOD_BY_LABEL = new Map<string, MoodLevel>(
	MOOD_OPTIONS.map((option) => [option.label.toLowerCase(), option.value]),
);

const MOOD_LABEL_BY_VALUE = new Map<MoodLevel, string>(
	MOOD_OPTIONS.map((option) => [option.value, option.label]),
);

export type ParsedIcsEvent = {
	uid?: string;
	/** Original journal entry id when the event came from a Skriuw export. */
	sourceEntryId?: string;
	dateKey: string;
	title?: string;
	content: string;
	tags: string[];
	mood?: MoodLevel;
	warnings: string[];
};

export type SkippedIcsEvent = {
	summary?: string;
	dateKey?: string;
	reason: string;
};

export type IcsParseResult = {
	calendarName?: string;
	totalEvents: number;
	events: ParsedIcsEvent[];
	skipped: SkippedIcsEvent[];
};

export type JournalImportMode = "skip" | "update";

export type JournalImportUpdate = {
	targetId: string;
	event: ParsedIcsEvent;
};

export type JournalImportPlan = {
	mode: JournalImportMode;
	creates: ParsedIcsEvent[];
	updates: JournalImportUpdate[];
	duplicates: ParsedIcsEvent[];
	skipped: SkippedIcsEvent[];
};

type ContentLine = {
	name: string;
	params: Record<string, string>;
	value: string;
};

/**
 * Validates an `.ics` upload before it is read. Returns a user-facing error
 * message, or `null` when the file is acceptable.
 */
export function validateIcsFile(file: { name: string; size: number; type: string }): string | null {
	const hasIcsExtension = /\.ics$/i.test(file.name);
	const hasCalendarType =
		file.type === "" || file.type.includes("calendar") || file.type.startsWith("text/");
	if (!hasIcsExtension && !hasCalendarType) {
		return "Only .ics calendar files are supported.";
	}
	if (!hasIcsExtension) {
		return "Only .ics calendar files are supported.";
	}
	if (file.size > MAX_ICS_IMPORT_BYTES) {
		return `File is too large — the limit is ${Math.floor(MAX_ICS_IMPORT_BYTES / (1024 * 1024))} MB.`;
	}
	if (file.size === 0) {
		return "The selected file is empty.";
	}
	return null;
}

function unfoldIcsLines(text: string): string[] {
	const raw = text.replace(/^\uFEFF/, "").split(/\r?\n/);
	const lines: string[] = [];
	for (const line of raw) {
		if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
			lines[lines.length - 1] += line.slice(1);
		} else if (line.length > 0) {
			lines.push(line);
		}
	}
	return lines;
}

function splitOutsideQuotes(value: string, separator: string): string[] {
	const parts: string[] = [];
	let current = "";
	let inQuotes = false;
	for (const char of value) {
		if (char === '"') {
			inQuotes = !inQuotes;
			current += char;
		} else if (char === separator && !inQuotes) {
			parts.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	parts.push(current);
	return parts;
}

function parseContentLine(line: string): ContentLine | null {
	let colonIndex = -1;
	let inQuotes = false;
	for (let index = 0; index < line.length; index++) {
		const char = line[index];
		if (char === '"') {
			inQuotes = !inQuotes;
		} else if (char === ":" && !inQuotes) {
			colonIndex = index;
			break;
		}
	}
	if (colonIndex <= 0) return null;

	const segments = splitOutsideQuotes(line.slice(0, colonIndex), ";");
	const name = segments[0]?.trim().toUpperCase();
	if (!name) return null;

	const params: Record<string, string> = {};
	for (const segment of segments.slice(1)) {
		const equalsIndex = segment.indexOf("=");
		if (equalsIndex <= 0) continue;
		params[segment.slice(0, equalsIndex).trim().toUpperCase()] = segment
			.slice(equalsIndex + 1)
			.replace(/^"(.*)"$/, "$1");
	}
	return { name, params, value: line.slice(colonIndex + 1) };
}

/** RFC 5545 TEXT unescaping: `\n`/`\N`, `\\`, `\;`, and `\,`. */
export function unescapeIcsText(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index++) {
		const char = value[index];
		if (char !== "\\") {
			out += char;
			continue;
		}
		const next = value[index + 1];
		if (next === "n" || next === "N") {
			out += "\n";
			index++;
		} else if (next === "\\" || next === ";" || next === ",") {
			out += next;
			index++;
		} else {
			out += char;
		}
	}
	return out;
}

function splitEscapedList(value: string): string[] {
	const parts: string[] = [];
	let current = "";
	for (let index = 0; index < value.length; index++) {
		const char = value[index];
		if (char === "\\" && index + 1 < value.length) {
			current += char + value[index + 1];
			index++;
		} else if (char === ",") {
			parts.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	parts.push(current);
	return parts;
}

type IcsDateValue = {
	dateKey: string;
	timed: boolean;
};

function parseIcsDateValue(value: string): IcsDateValue | null {
	const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
	if (!match) return null;
	const dateKey = `${match[1]}-${match[2]}-${match[3]}`;
	if (!isDateKey(dateKey)) return null;
	return { dateKey, timed: Boolean(match[4]) };
}

type SkriuwMetadata = {
	body: string;
	mood?: MoodLevel;
	tags: string[];
	people: string[];
};

function parseSkriuwMetadata(description: string): SkriuwMetadata {
	const fallback: SkriuwMetadata = { body: description, tags: [], people: [] };
	if (!description.startsWith("---\n")) return fallback;
	const closingIndex = description.indexOf("\n---", 4);
	if (closingIndex < 0) return fallback;

	const frontmatterLines = description.slice(4, closingIndex).split("\n");
	let mood: MoodLevel | undefined;
	const tags: string[] = [];
	const people: string[] = [];
	for (const line of frontmatterLines) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex <= 0) return fallback;
		const key = line.slice(0, separatorIndex).trim().toLowerCase();
		const value = line.slice(separatorIndex + 1).trim();
		if (key === "mood") {
			const level = MOOD_BY_LABEL.get(value.toLowerCase());
			if (!level) return fallback;
			mood = level;
		} else if (key === "tags") {
			tags.push(...value.split(",").map((tag) => tag.trim()));
		} else if (key === "people") {
			people.push(
				...value
					.split(",")
					.map((person) => person.trim())
					.filter(Boolean),
			);
		} else {
			return fallback;
		}
	}

	const body = description.slice(closingIndex + "\n---".length).replace(/^\n+/, "");
	return { body, mood, tags: tags.filter(Boolean), people };
}

function normalizeTags(rawTags: string[]): string[] {
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const raw of rawTags) {
		const normalized = normalizeTagName(raw);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		tags.push(normalized);
	}
	return tags;
}

function stripMoodSuffix(title: string, mood: MoodLevel | undefined): string {
	if (!mood) return title;
	const label = MOOD_LABEL_BY_VALUE.get(mood);
	const suffix = ` (${label})`;
	return label && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

type RawEvent = {
	properties: ContentLine[];
	warnings: string[];
};

function finalizeEvent(raw: RawEvent): { event?: ParsedIcsEvent; skipped?: SkippedIcsEvent } {
	const byName = new Map<string, ContentLine[]>();
	for (const property of raw.properties) {
		const existing = byName.get(property.name);
		if (existing) {
			existing.push(property);
		} else {
			byName.set(property.name, [property]);
		}
	}

	function first(name: string): ContentLine | undefined {
		return byName.get(name)?.[0];
	}

	const summary = first("SUMMARY") ? unescapeIcsText(first("SUMMARY")!.value).trim() : "";

	if (byName.has("RRULE") || byName.has("RDATE")) {
		return {
			skipped: {
				summary: summary || undefined,
				reason: "Recurring events are not supported",
			},
		};
	}
	if (first("STATUS")?.value.trim().toUpperCase() === "CANCELLED") {
		return { skipped: { summary: summary || undefined, reason: "Event is cancelled" } };
	}

	const dtstart = first("DTSTART");
	if (!dtstart) {
		return {
			skipped: { summary: summary || undefined, reason: "Missing start date (DTSTART)" },
		};
	}
	const start = parseIcsDateValue(dtstart.value);
	if (!start) {
		return {
			skipped: { summary: summary || undefined, reason: "Invalid or unsupported start date" },
		};
	}

	const warnings = [...raw.warnings];
	if (start.timed) {
		warnings.push("Timed event — imported as an all-day journal entry on its start date");
	}

	const dtend = first("DTEND");
	if (dtend && !start.timed) {
		const end = parseIcsDateValue(dtend.value);
		if (end) {
			const exclusiveNextDay = new Date(`${start.dateKey}T00:00:00Z`);
			exclusiveNextDay.setUTCDate(exclusiveNextDay.getUTCDate() + 1);
			const nextDayKey = exclusiveNextDay.toISOString().slice(0, 10);
			if (end.dateKey > nextDayKey) {
				warnings.push("Multi-day event — imported on its start date only");
			}
		}
	}

	if (byName.has("ATTACH")) {
		warnings.push("Attachments are not imported");
	}
	for (const name of ["SUMMARY", "DESCRIPTION"]) {
		const encoding = first(name)?.params["ENCODING"];
		if (encoding && encoding.toUpperCase() !== "8BIT") {
			warnings.push(`Unsupported ${name} encoding "${encoding}" — text imported as-is`);
		}
	}

	const uid = first("UID") ? unescapeIcsText(first("UID")!.value).trim() : undefined;
	const sourceEntryId =
		uid && uid.endsWith(SKRIUW_UID_SUFFIX)
			? uid.slice(0, -SKRIUW_UID_SUFFIX.length)
			: undefined;

	const description = first("DESCRIPTION") ? unescapeIcsText(first("DESCRIPTION")!.value) : "";

	let mood: MoodLevel | undefined;
	let body = description;
	const frontmatterTags: string[] = [];
	if (sourceEntryId) {
		const metadata = parseSkriuwMetadata(description);
		body = metadata.body;
		mood = metadata.mood;
		frontmatterTags.push(...metadata.tags);
		if (metadata.people.length > 0) {
			// Person mentions cannot be re-linked by name without risking a wrong
			// match, so the resolved names are preserved as plain text instead.
			body = [body.trim(), `People: ${metadata.people.join(", ")}`]
				.filter(Boolean)
				.join("\n\n");
		}
	}

	const categories = (byName.get("CATEGORIES") ?? []).flatMap((property) =>
		splitEscapedList(property.value).map((part) => unescapeIcsText(part).trim()),
	);
	const tags = normalizeTags([...frontmatterTags, ...categories]);

	let title: string | undefined = summary || undefined;
	if (title && sourceEntryId) {
		title = stripMoodSuffix(title, mood);
		if (title === `Journal — ${start.dateKey}`) title = undefined;
	}

	return {
		event: {
			uid,
			sourceEntryId,
			dateKey: start.dateKey,
			title,
			content: body.trim(),
			tags,
			mood: mood && isMoodLevel(mood) ? mood : undefined,
			warnings,
		},
	};
}

/**
 * Parses an iCalendar (RFC 5545) document into journal-entry candidates.
 * Handles folded lines, CRLF/LF endings, escaped TEXT values, all-day and
 * timed events, and Skriuw export metadata (mood/tags/people frontmatter and
 * `@skriuw` UIDs). Unsupported constructs (recurrence, alarms, attachments,
 * time zones) are classified as skips or warnings — nothing is ever evaluated
 * as code. Throws a user-safe `Error` when the input is not an iCalendar file.
 */
export function parseJournalIcs(text: string): IcsParseResult {
	const lines = unfoldIcsLines(text);
	if (!lines.some((line) => line.trim().toUpperCase() === "BEGIN:VCALENDAR")) {
		throw new Error("This file is not an iCalendar (.ics) document.");
	}

	let calendarName: string | undefined;
	const events: ParsedIcsEvent[] = [];
	const skipped: SkippedIcsEvent[] = [];
	let totalEvents = 0;

	let currentEvent: RawEvent | null = null;
	let nestedComponentDepth = 0;

	for (const line of lines) {
		const parsed = parseContentLine(line);
		if (!parsed) continue;

		if (currentEvent) {
			if (parsed.name === "BEGIN") {
				nestedComponentDepth++;
				if (parsed.value.trim().toUpperCase() === "VALARM") {
					currentEvent.warnings.push("Reminders/alarms are not imported");
				}
				continue;
			}
			if (parsed.name === "END") {
				if (nestedComponentDepth > 0) {
					nestedComponentDepth--;
					continue;
				}
				if (parsed.value.trim().toUpperCase() === "VEVENT") {
					const result = finalizeEvent(currentEvent);
					if (result.event) events.push(result.event);
					if (result.skipped) skipped.push(result.skipped);
					currentEvent = null;
				}
				continue;
			}
			if (nestedComponentDepth === 0) {
				currentEvent.properties.push(parsed);
			}
			continue;
		}

		if (parsed.name === "BEGIN" && parsed.value.trim().toUpperCase() === "VEVENT") {
			totalEvents++;
			currentEvent = { properties: [], warnings: [] };
		} else if (parsed.name === "X-WR-CALNAME") {
			calendarName = unescapeIcsText(parsed.value).trim() || undefined;
		}
	}

	return { calendarName, totalEvents, events, skipped };
}

/**
 * Classifies parsed events against the existing journal. Identity is the
 * entry date — the journal keeps one entry per day — plus the Skriuw source
 * id when the event came from a Skriuw export. In `skip` mode (the default)
 * duplicates are left untouched; in `update` mode they replace the matching
 * entry's title, body, tags, and mood. Later events in the same file that
 * target an already-claimed date are skipped so one import can never write
 * the same day twice.
 */
export function planJournalIcsImport(
	parsed: IcsParseResult,
	existingEntries: ReadonlyArray<{ id: string; dateKey: string }>,
	mode: JournalImportMode,
): JournalImportPlan {
	const existingByDate = new Map(existingEntries.map((entry) => [entry.dateKey, entry.id]));
	const existingIds = new Set(existingEntries.map((entry) => entry.id));

	const creates: ParsedIcsEvent[] = [];
	const updates: JournalImportUpdate[] = [];
	const duplicates: ParsedIcsEvent[] = [];
	const skipped: SkippedIcsEvent[] = [...parsed.skipped];
	const claimedDates = new Set<string>();

	for (const event of parsed.events) {
		if (claimedDates.has(event.dateKey)) {
			skipped.push({
				summary: event.title,
				dateKey: event.dateKey,
				reason: "Another event in this file already targets this date",
			});
			continue;
		}
		claimedDates.add(event.dateKey);

		const existingId =
			existingByDate.get(event.dateKey) ??
			(event.sourceEntryId && existingIds.has(event.sourceEntryId)
				? event.sourceEntryId
				: undefined);

		if (!existingId) {
			creates.push(event);
		} else if (mode === "update") {
			updates.push({ targetId: existingId, event });
		} else {
			duplicates.push(event);
		}
	}

	return { mode, creates, updates, duplicates, skipped };
}

export type JournalImportSummary = {
	created: number;
	updated: number;
	skippedDuplicates: number;
	skippedInvalid: number;
	failed: number;
};

/** Builds the one-line toast/result copy for a finished import. */
export function summarizeJournalImport(summary: JournalImportSummary): string {
	const parts: string[] = [];
	if (summary.created > 0) parts.push(`${summary.created} created`);
	if (summary.updated > 0) parts.push(`${summary.updated} updated`);
	if (summary.skippedDuplicates > 0)
		parts.push(`${summary.skippedDuplicates} duplicates skipped`);
	if (summary.skippedInvalid > 0) parts.push(`${summary.skippedInvalid} skipped`);
	if (summary.failed > 0) parts.push(`${summary.failed} failed`);
	return parts.length > 0 ? `Import finished — ${parts.join(", ")}.` : "Nothing to import.";
}
