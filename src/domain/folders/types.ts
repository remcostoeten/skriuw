import type { FolderId } from "@/core/persistence-types";

export type CreateFolderInput = {
  id?: FolderId;
  name: string;
  parentId?: FolderId | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type UpdateFolderInput = {
  id: FolderId;
  name?: string;
  parentId?: FolderId | null;
  updatedAt?: Date;
};
