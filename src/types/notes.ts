// Mood system for journal entries
export type MoodLevel = 'great' | 'good' | 'neutral' | 'low' | 'rough';

export type Mood = {
  level: MoodLevel;
  label: string;
  icon: string;
  color: string;
};

export const MOOD_OPTIONS: Record<MoodLevel, Mood> = {
  great: { level: 'great', label: 'Great', icon: '++', color: 'text-emerald-400' },
  good: { level: 'good', label: 'Good', icon: '+', color: 'text-green-400' },
  neutral: { level: 'neutral', label: 'Neutral', icon: '~', color: 'text-muted-foreground' },
  low: { level: 'low', label: 'Low', icon: '-', color: 'text-amber-400' },
  rough: { level: 'rough', label: 'Rough', icon: '--', color: 'text-red-400' },
};

// Tag system for organizing notes
export type NoteTag = {
  id: string;
  name: string;
  color?: string;
  usageCount: number;
  createdAt: Date;
};

// Journal-specific metadata
export type JournalMetadata = {
  mood?: MoodLevel;
  tags: string[];
  weather?: string;
  location?: string;
};

export interface NoteFile {
  id: string;
  name: string;
  content: string;
  createdAt: Date;
  modifiedAt: Date;
  parentId: string | null;
  // Optional journal metadata
  journalMeta?: JournalMetadata;
}

export interface NoteFolder {
  id: string;
  name: string;
  parentId: string | null;
  isOpen: boolean;
}

export type SidebarItem = 
  | { type: 'file'; data: NoteFile }
  | { type: 'folder'; data: NoteFolder; children: SidebarItem[] };
