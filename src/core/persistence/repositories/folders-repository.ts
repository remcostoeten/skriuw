import { createFolder, destroyFolder, readFolders, updateFolder } from "@/core/folders";
import type { CreateFolderInput, UpdateFolderInput } from "@/core/folders";
import type { FolderId } from "@/core/shared/persistence-types";
import type { NoteFolder } from "@/types/notes";

export interface FoldersRepository {
  list(): Promise<NoteFolder[]>;
  create(input: CreateFolderInput): Promise<NoteFolder>;
  update(input: UpdateFolderInput): Promise<NoteFolder | undefined>;
  destroy(id: FolderId): Promise<void>;
}

export const indexedDbFoldersRepository: FoldersRepository = {
  list: () => readFolders(),
  create: (input) => createFolder(input),
  update: (input) => updateFolder(input),
  destroy: (id) => destroyFolder(id),
};
