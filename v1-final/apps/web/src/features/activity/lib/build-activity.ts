import { format, isSameDay, isSameYear } from "date-fns";
import type { NoteFile } from "@/types/notes";
import type { TrashBatch } from "@/core/workspace-backend/types";

export type ActivityKind = "created" | "edited" | "deleted";

export type ActivityEntry = {
	id: string;
	kind: ActivityKind;
	noteId: string | null;
	name: string;
	timestamp: Date;
};

export type ActivityDay = {
	id: string;
	label: string;
	sublabel: string;
	entries: ActivityEntry[];
};

export type ActivityStats = Record<ActivityKind, number>;

const EDIT_VISIBILITY_THRESHOLD_MS = 60 * 1000;
const UNTITLED_LABEL = "Untitled note";
const DAY_MS = 24 * 60 * 60 * 1000;

function resolveNoteName(name: string): string {
	const trimmed = name.trim();
	return trimmed.length > 0 ? trimmed : UNTITLED_LABEL;
}

export function buildActivityEntries(notes: NoteFile[], trash: TrashBatch[]): ActivityEntry[] {
	const entries: ActivityEntry[] = [];

	for (const note of notes) {
		const name = resolveNoteName(note.name);
		entries.push({
			id: `created:${note.id}`,
			kind: "created",
			noteId: note.id,
			name,
			timestamp: note.createdAt,
		});

		const editedGap = note.modifiedAt.getTime() - note.createdAt.getTime();
		if (editedGap > EDIT_VISIBILITY_THRESHOLD_MS) {
			entries.push({
				id: `edited:${note.id}`,
				kind: "edited",
				noteId: note.id,
				name,
				timestamp: note.modifiedAt,
			});
		}
	}

	for (const batch of trash) {
		if (batch.kind !== "note") continue;
		entries.push({
			id: `deleted:${batch.id}`,
			kind: "deleted",
			noteId: null,
			name: resolveNoteName(batch.primary.name),
			timestamp: batch.deletedAt,
		});
	}

	return entries.toSorted((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
}

function startOfDay(date: Date): Date {
	const next = new Date(date);
	next.setHours(0, 0, 0, 0);
	return next;
}

function dayLabel(day: Date, now: Date): { label: string; sublabel: string } {
	const todayStart = startOfDay(now).getTime();
	const dayStart = startOfDay(day).getTime();
	const sublabel = isSameYear(day, now) ? format(day, "MMMM d") : format(day, "MMMM d, yyyy");

	if (isSameDay(day, now)) return { label: "Today", sublabel };
	if (todayStart - dayStart <= DAY_MS) return { label: "Yesterday", sublabel };
	if (todayStart - dayStart < 7 * DAY_MS) return { label: format(day, "EEEE"), sublabel };
	return { label: sublabel, sublabel: format(day, "EEEE") };
}

export function groupActivityByDay(
	entries: ActivityEntry[],
	now: Date = new Date(),
): ActivityDay[] {
	const days: ActivityDay[] = [];

	for (const entry of entries) {
		const id = format(entry.timestamp, "yyyy-MM-dd");
		const current = days.at(-1);
		if (current && current.id === id) {
			current.entries.push(entry);
			continue;
		}
		const { label, sublabel } = dayLabel(entry.timestamp, now);
		days.push({ id, label, sublabel, entries: [entry] });
	}

	return days;
}

export function countActivityByKind(entries: ActivityEntry[]): ActivityStats {
	const stats: ActivityStats = { created: 0, edited: 0, deleted: 0 };
	for (const entry of entries) {
		stats[entry.kind] += 1;
	}
	return stats;
}
