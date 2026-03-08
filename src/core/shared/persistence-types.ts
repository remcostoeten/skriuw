import type { TemplateStyle } from "@/store/preferences-store";
import type { MoodLevel } from "@/types/notes";

export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };
export type Id<TName extends string> = Brand<string, `${TName}Id`>;

/** ISO-8601 timestamp string persisted across adapters. */
export type IsoTime = Brand<string, "IsoTime">;

/** Stable yyyy-mm-dd journal key. */
export type DateKey = Brand<string, "DateKey">;

/** Durable markdown document content. */
export type MarkdownContent = Brand<string, "MarkdownContent">;

/** User-visible tag label persisted with journal entries and tags. */
export type TagName = Brand<string, "TagName">;

/** Serialized color token or CSS color string. */
export type CssColorValue = Brand<string, "CssColorValue">;

export type NoteId = Id<"Note">;
export type FolderId = Id<"Folder">;
export type JournalEntryId = Id<"JournalEntry">;
export type TagId = Id<"Tag">;
export type PreferencesId = "preferences";

export const PERSISTENCE_SCHEMA_VERSION = 1 as const;

export const PERSISTED_STORE_NAMES = {
  notes: "notes",
  folders: "folders",
  journalEntries: "journalEntries",
  tags: "tags",
  preferences: "preferences",
} as const;

export type PersistedStoreName = (typeof PERSISTED_STORE_NAMES)[keyof typeof PERSISTED_STORE_NAMES];

/** Shared timestamps for persisted entities. */
export type Timestamps = {
  createdAt: IsoTime;
  updatedAt: IsoTime;
};

/** Shared entity shape for every JSON-safe persisted record. */
export type Entity<TId extends string = string> = {
  id: TId;
} & Timestamps;

export type PersistedNote = Entity<NoteId> & {
  name: string;
  content: MarkdownContent;
  parentId: FolderId | null;
  journalMeta?: PersistedNoteJournalMetadata;
};

export type PersistedFolder = Entity<FolderId> & {
  name: string;
  parentId: FolderId | null;
};

export type PersistedNoteJournalMetadata = {
  mood?: MoodLevel;
  tags: TagName[];
  weather?: string;
  location?: string;
};

export type PersistedJournalEntry = Entity<JournalEntryId> & {
  dateKey: DateKey;
  content: MarkdownContent;
  mood?: MoodLevel | null;
  tags: TagName[];
};

export type PersistedTag = Entity<TagId> & {
  name: TagName;
  color: CssColorValue;
  usageCount: number;
  lastUsedAt: IsoTime | null;
};

export type PersistedPreferences = Entity<PreferencesId> & {
  editorDefaultModeMarkdown: boolean;
  templateStyle: TemplateStyle;
  diaryModeEnabled: boolean;
};

export type PersistedRecordMap = {
  [PERSISTED_STORE_NAMES.notes]: PersistedNote;
  [PERSISTED_STORE_NAMES.folders]: PersistedFolder;
  [PERSISTED_STORE_NAMES.journalEntries]: PersistedJournalEntry;
  [PERSISTED_STORE_NAMES.tags]: PersistedTag;
  [PERSISTED_STORE_NAMES.preferences]: PersistedPreferences;
};

export type PersistedRecordForStore<TStoreName extends PersistedStoreName> =
  PersistedRecordMap[TStoreName];
