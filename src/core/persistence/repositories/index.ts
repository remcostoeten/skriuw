export { foldersRepository, type FoldersRepository } from "./folders-repository";
export { journalRepository, type JournalRepository } from "./journal-repository";
export { notesRepository, type NotesRepository } from "./notes-repository";
export {
  resolveLocalPersistenceBackend,
  detectLocalPersistenceDurability,
  type LocalPersistenceBackend,
  type LocalPersistenceDurability,
} from "./local-backend";
