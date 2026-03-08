import { MoodLevel } from '@/types/notes';

export type JournalTag = {
  id: string;
  name: string;
  color: string;
  usageCount: number;
};

export type JournalEntry = {
  id: string;
  // Date key in YYYY-MM-DD format
  dateKey: string;
  content: string;
  tags: string[];
  mood?: MoodLevel;
  createdAt: Date;
  updatedAt: Date;
};

export type JournalConfig = {
  entries: JournalEntry[];
  tags: JournalTag[];
};

export const TAG_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
] as const;

export const DEFAULT_JOURNAL_CONFIG: JournalConfig = {
  entries: [],
  tags: [],
};
