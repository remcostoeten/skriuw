import type { NoteFile, NoteFolder } from "@/types/notes";

/**
 * Consolidated mutation callbacks for the note tree.
 *
 * Previously these were passed as 8 separate props through three layers
 * (use-notes-layout → SidebarPanel → FileTreeSection → FileList). Grouping
 * them into a single object keeps `React.memo` effective (one stable
 * reference instead of eight), shortens prop lists, and makes the tree
 * surface easier to extend.
 */
export type NoteTreeActions = {
	onFileSelect: (id: string) => void;
	onToggleFolder: (id: string) => void;
	onRenameFile: (id: string, name: string) => void;
	onRenameFolder: (id: string, name: string) => void;
	onDeleteFile: (id: string) => void;
	onDeleteFolder: (id: string) => void;
	onMoveFile: (fileId: string, newParentId: string | null) => void;
	onMoveFolder: (folderId: string, newParentId: string | null) => void;
};

/**
 * Derived-tree-state queries used by the file list. Kept separate from
 * mutations because consumers (e.g. search) may not need them.
 */
export type NoteTreeQueries = {
	getFilesInFolder: (parentId: string | null) => NoteFile[];
	getFoldersInFolder: (parentId: string | null) => NoteFolder[];
	countDescendants: (folderId: string) => number;
};
