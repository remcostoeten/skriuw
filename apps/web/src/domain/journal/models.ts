import type { RichTextDocument } from "@/domain/notes/models";

export type MoodLevel = "great" | "good" | "neutral" | "low" | "rough";

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
	createdAt: Date;
	updatedAt: Date;
};
