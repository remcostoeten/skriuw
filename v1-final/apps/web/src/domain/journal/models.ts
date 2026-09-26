import type { RichTextDocument } from "@/domain/notes/models";
export type { MoodLevel } from "@skriuw/domain/journal";
import type { MoodLevel } from "@skriuw/domain/journal";

export type JournalTag = {
	id: string;
	name: string;
	color: string;
	usageCount: number;
};

export type JournalEntry = {
	id: string;
	dateKey: string;
	title?: string;
	content: string;
	richContent?: RichTextDocument;
	tags: string[];
	mood?: MoodLevel;
	calendarSourceId?: string;
	calendarSourceUid?: string;
	createdAt: Date;
	updatedAt: Date;
};
