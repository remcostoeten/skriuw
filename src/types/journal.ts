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
  content: string;
  tags: string[];
  mood?: MoodLevel;
  createdAt: Date;
  updatedAt: Date;
};
