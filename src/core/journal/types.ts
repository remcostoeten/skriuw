import type {
  CssColorValue,
  DateKey,
  IsoTime,
  JournalEntryId,
  TagId,
  TagName,
} from "@/core/shared/persistence-types";
import type { MoodLevel } from "@/types/journal";

export type CreateJournalEntryInput = {
  id?: JournalEntryId;
  dateKey: DateKey;
  content: string;
  tags?: TagName[];
  mood?: MoodLevel;
  createdAt?: Date;
  updatedAt?: Date;
};

export type UpdateJournalEntryInput = {
  id: JournalEntryId;
  content?: string;
  tags?: TagName[];
  mood?: MoodLevel | null;
  updatedAt?: Date;
};

export type CreateJournalTagInput = {
  id?: TagId;
  name: TagName;
  color: CssColorValue;
  usageCount?: number;
  lastUsedAt?: IsoTime | null;
  createdAt?: Date;
  updatedAt?: Date;
};
