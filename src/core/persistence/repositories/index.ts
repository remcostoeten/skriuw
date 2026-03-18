export {
  foldersRepository,
  indexedDbFoldersRepository,
  pGliteFoldersRepository,
  type FoldersRepository,
} from "./folders-repository";
export {
  journalRepository,
  indexedDbJournalRepository,
  pGliteJournalRepository,
  type JournalRepository,
} from "./journal-repository";
export {
  notesRepository,
  indexedDbNotesRepository,
  pGliteNotesRepository,
  type NotesRepository,
} from "./notes-repository";
export {
  resolveLocalPersistenceBackend,
  detectLocalPersistenceDurability,
  type LocalPersistenceBackend,
  type LocalPersistenceDurability,
} from "./local-backend";
