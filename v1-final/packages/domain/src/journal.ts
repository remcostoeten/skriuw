export const MOOD_LEVELS = ["great", "good", "neutral", "low", "rough"] as const;
export type MoodLevel = (typeof MOOD_LEVELS)[number];

export const MOOD_OPTIONS: ReadonlyArray<{ value: MoodLevel; label: string }> = [
	{ value: "rough", label: "Rough" },
	{ value: "low", label: "Low" },
	{ value: "neutral", label: "Neutral" },
	{ value: "good", label: "Good" },
	{ value: "great", label: "Great" },
];

export type JournalEntryWire = {
	id: string;
	dateKey: string;
	title?: string;
	content: string;
	tags: string[];
	mood?: MoodLevel;
	createdAt: string;
	updatedAt: string;
};

export type CreateJournalEntryWireInput = {
	dateKey: string;
	title?: string | null;
	content: string;
	tags?: string[];
	mood?: MoodLevel;
};

export type UpdateJournalEntryWireInput = Partial<Omit<CreateJournalEntryWireInput, "dateKey">> & {
	id: string;
};

export function isMoodLevel(value: unknown): value is MoodLevel {
	return typeof value === "string" && (MOOD_LEVELS as readonly string[]).includes(value);
}

export function localDateKey(date = new Date()): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateFromKey(key: string): Date {
	const [year, month, day] = key.split("-").map(Number);
	return new Date(year, month - 1, day);
}

export function isDateKey(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	return localDateKey(dateFromKey(value)) === value;
}

export function mergeJournalEntriesByDate<
	T extends { id: string; dateKey: string; createdAt: string | Date; updatedAt: string | Date },
>(entries: T[]): T[] {
	const byDate = new Map<string, T>();
	for (const entry of entries) {
		const current = byDate.get(entry.dateKey);
		const entryTime =
			new Date(entry.updatedAt).getTime() || new Date(entry.createdAt).getTime();
		const currentTime = current
			? new Date(current.updatedAt).getTime() || new Date(current.createdAt).getTime()
			: 0;
		if (
			!current ||
			entryTime > currentTime ||
			(entryTime === currentTime && entry.id > current.id)
		)
			byDate.set(entry.dateKey, entry);
	}
	return [...byDate.values()];
}
