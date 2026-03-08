import type {
  CssColorValue,
  DateKey,
  JournalEntryId,
  TagId,
  TagName,
} from "@/core/shared/persistence-types";
import type { MoodLevel } from "@/types/notes";

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
  mood?: MoodLevel;
  updatedAt?: Date;
};

export type CreateJournalTagInput = {
  id?: TagId;
  name: TagName;
  color: CssColorValue;
};
