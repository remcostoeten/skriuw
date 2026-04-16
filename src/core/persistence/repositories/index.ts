import {
  createFoldersRepository,
} from "./folders-repository";
import {
  createJournalRepository,
} from "./journal-repository";
import {
  createNotesRepository,
} from "./notes-repository";
import { getWorkspaceTarget } from "@/platform/persistence/workspace-target";
import type {
  FoldersRepository,
  JournalRepository,
  NotesRepository,
  WorkspaceTarget,
} from "./contracts";

export type { FoldersRepository, JournalRepository, NotesRepository };
export type { WorkspaceTarget } from "./contracts";
export {
  detectLocalPersistenceDurability,
  type LocalPersistenceDurability,
} from "./local-backend";

export type PersistenceRepositories = {
  notes: NotesRepository;
  folders: FoldersRepository;
  journal: JournalRepository;
};

export function createPersistenceRepositories(target: WorkspaceTarget): PersistenceRepositories {
  return {
    notes: createNotesRepository(target),
    folders: createFoldersRepository(target),
    journal: createJournalRepository(target),
  };
}

export function getPersistenceRepositories(): PersistenceRepositories {
  return createPersistenceRepositories(getWorkspaceTarget());
}

export const notesRepository: NotesRepository = {
  list: () => getPersistenceRepositories().notes.list(),
  create: (input) => getPersistenceRepositories().notes.create(input),
  update: (input) => getPersistenceRepositories().notes.update(input),
  destroy: (id) => getPersistenceRepositories().notes.destroy(id),
};

export const foldersRepository: FoldersRepository = {
  list: () => getPersistenceRepositories().folders.list(),
  create: (input) => getPersistenceRepositories().folders.create(input),
  update: (input) => getPersistenceRepositories().folders.update(input),
  destroy: (id) => getPersistenceRepositories().folders.destroy(id),
};

export const journalRepository: JournalRepository = {
  listEntries: () => getPersistenceRepositories().journal.listEntries(),
  createEntry: (input) => getPersistenceRepositories().journal.createEntry(input),
  updateEntry: (input) => getPersistenceRepositories().journal.updateEntry(input),
  destroyEntry: (id) => getPersistenceRepositories().journal.destroyEntry(id),
  listTags: () => getPersistenceRepositories().journal.listTags(),
  createTag: (input) => getPersistenceRepositories().journal.createTag(input),
  destroyTag: (id) => getPersistenceRepositories().journal.destroyTag(id),
};
