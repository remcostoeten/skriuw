export type MoodLevel = "great" | "good" | "neutral" | "low" | "rough";

export type MobileFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MobileNote = {
  id: string;
  name: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MobileJournalEntry = {
  id: string;
  dateKey: string;
  content: string;
  tags: string[];
  mood?: MoodLevel;
  createdAt: string;
  updatedAt: string;
};

export type MobileWorkspace = {
  folders: MobileFolder[];
  notes: MobileNote[];
  journalEntries: MobileJournalEntry[];
};
