import { buildMobileStarterWorkspace } from "../../../../src/core/shared/starter-content";
import type {
  MobileFolder,
  MobileJournalEntry,
  MobileNote,
  MobileWorkspace,
} from "./workspace-types";

export function buildStarterFolders(): MobileFolder[] {
  return buildMobileStarterWorkspace().folders;
}

export function buildStarterNotes(): MobileNote[] {
  return buildMobileStarterWorkspace().notes;
}

export function buildStarterJournalEntries(): MobileJournalEntry[] {
  return buildMobileStarterWorkspace().journalEntries;
}

export function buildStarterWorkspace(): MobileWorkspace {
  return buildMobileStarterWorkspace();
}
