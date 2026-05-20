import type { DateKey, CssColorValue } from "@/core/persistence-types";
import type { JournalEntry, JournalTag, MoodLevel } from "@/types/journal";

export type { DateKey, CssColorValue };
export type { JournalEntry, JournalTag, MoodLevel };

export type Mood = {
	level: MoodLevel;
	label: string;
	icon: string;
	color: string;
};

export const MOOD_OPTIONS = {
	great: { level: "great", label: "Great", icon: "++", color: "text-mood-great" },
	good: { level: "good", label: "Good", icon: "+", color: "text-mood-good" },
	neutral: { level: "neutral", label: "Neutral", icon: "~", color: "text-muted-foreground" },
	low: { level: "low", label: "Low", icon: "-", color: "text-mood-low" },
	rough: { level: "rough", label: "Rough", icon: "--", color: "text-mood-rough" },
} as const satisfies Record<MoodLevel, Mood>;

export type JournalConfig = {
	entries: JournalEntry[];
	tags: JournalTag[];
};

export const TAG_COLORS: readonly CssColorValue[] = [
	"hsl(var(--project-blue))" as CssColorValue,
	"hsl(var(--project-purple))" as CssColorValue,
	"hsl(var(--project-pink))" as CssColorValue,
	"hsl(var(--project-red))" as CssColorValue,
	"hsl(var(--project-orange))" as CssColorValue,
	"hsl(var(--project-amber))" as CssColorValue,
	"hsl(var(--project-green))" as CssColorValue,
	"hsl(var(--project-teal))" as CssColorValue,
];

export const DEFAULT_JOURNAL_CONFIG: JournalConfig = {
	entries: [],
	tags: [],
};
