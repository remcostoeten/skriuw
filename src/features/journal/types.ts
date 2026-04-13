import type { DateKey, CssColorValue } from "@/core/shared/persistence-types";
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
  great: { level: "great", label: "Great", icon: "++", color: "text-emerald-400" },
  good: { level: "good", label: "Good", icon: "+", color: "text-green-400" },
  neutral: { level: "neutral", label: "Neutral", icon: "~", color: "text-muted-foreground" },
  low: { level: "low", label: "Low", icon: "-", color: "text-amber-400" },
  rough: { level: "rough", label: "Rough", icon: "--", color: "text-red-400" },
} as const satisfies Record<MoodLevel, Mood>;

export type JournalConfig = {
  entries: JournalEntry[];
  tags: JournalTag[];
};

export const TAG_COLORS: readonly CssColorValue[] = [
  '#6366f1' as CssColorValue, // indigo
  '#8b5cf6' as CssColorValue, // violet
  '#ec4899' as CssColorValue, // pink
  '#f43f5e' as CssColorValue, // rose
  '#f97316' as CssColorValue, // orange
  '#eab308' as CssColorValue, // yellow
  '#22c55e' as CssColorValue, // green
  '#14b8a6' as CssColorValue, // teal
  '#06b6d4' as CssColorValue, // cyan
  '#3b82f6' as CssColorValue, // blue
];

export const DEFAULT_JOURNAL_CONFIG: JournalConfig = {
  entries: [],
  tags: [],
};
