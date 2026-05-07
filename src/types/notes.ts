import type { PartialBlock } from "@blocknote/core";
import type { MoodLevel } from "@/types/journal";

export type NoteEditorMode = "raw" | "block";
export type RichTextDocument = PartialBlock[];

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
  richContent: RichTextDocument;
  preferredEditorMode: NoteEditorMode;
  createdAt: Date;
  modifiedAt: Date;
  parentId: string | null;
  tags?: string[];
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
  | { type: "file"; data: NoteFile }
  | { type: "folder"; data: NoteFolder; children: SidebarItem[] };
