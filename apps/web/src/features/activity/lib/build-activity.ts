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

export type ActivityBucketId = "today" | "week" | "older";

export type ActivityBucket = {
	id: ActivityBucketId;
	label: string;
	entries: ActivityEntry[];
};

const EDIT_VISIBILITY_THRESHOLD_MS = 60 * 1000;
const UNTITLED_LABEL = "Untitled note";

function resolveNoteName(name: string): string {
	const trimmed = name.trim();
	return trimmed.length > 0 ? trimmed : UNTITLED_LABEL;
}

export function buildActivityEntries(
	notes: NoteFile[],
	trash: TrashBatch[],
): ActivityEntry[] {
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

	return entries.toSorted(
		(left, right) => right.timestamp.getTime() - left.timestamp.getTime(),
	);
}

function startOfDay(date: Date): Date {
	const next = new Date(date);
	next.setHours(0, 0, 0, 0);
	return next;
}

export function groupActivityByTime(
	entries: ActivityEntry[],
	now: Date = new Date(),
): ActivityBucket[] {
	const todayStart = startOfDay(now).getTime();
	const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

	const today: ActivityEntry[] = [];
	const week: ActivityEntry[] = [];
	const older: ActivityEntry[] = [];

	for (const entry of entries) {
		const time = entry.timestamp.getTime();
		if (time >= todayStart) {
			today.push(entry);
		} else if (time >= weekStart) {
			week.push(entry);
		} else {
			older.push(entry);
		}
	}

	return [
		{ id: "today", label: "Today", entries: today },
		{ id: "week", label: "This week", entries: week },
		{ id: "older", label: "Older", entries: older },
	].filter((bucket) => bucket.entries.length > 0) as ActivityBucket[];
}
