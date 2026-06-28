import type { CreateNoteInput, UpdateNoteInput } from "@/domain/notes/actions";
import type { CreateFolderInput, UpdateFolderInput } from "@/domain/folders/actions";
import type { NoteFile, NoteFolder, RichTextDocument } from "@/domain/notes/models";
import { deriveNoteNameFromHeading, nameTracksHeading } from "@/domain/notes/note-links";
import { markdownToRichDocument } from "@/domain/notes/rich-document";

/**
 * Pure record builders shared by the non-server `WorkspaceBackend`
 * implementations (guest `localBackend`, desktop `tauriBackend`). The server
 * backend builds records inside Prisma writes instead. Keeping these in one
 * place means guest and desktop edits produce byte-identical records.
 */

export function ensureNoteName(name: string): string {
	const trimmed = name.trim() || "Untitled";
	return trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
}

export function noteFromCreateInput(input: CreateNoteInput): NoteFile {
	const richContent: RichTextDocument =
		input.richContent ?? markdownToRichDocument(input.content ?? "");
	const now = new Date();
	return {
		id: input.id ?? crypto.randomUUID(),
		name: ensureNoteName(input.name),
		content: input.content ?? "",
		richContent,
		preferredEditorMode: input.preferredEditorMode ?? "block",
		createdAt: now,
		modifiedAt: now,
		parentId: input.parentId ?? null,
		sortOrder: input.sortOrder ?? 0,
		tags: input.tags ?? [],
	};
}

export type ApplyNoteUpdateOptions = {
	resolveName?: (input: UpdateNoteInput, note: NoteFile) => string;
	resolveRichContent?: (input: UpdateNoteInput, note: NoteFile) => RichTextDocument;
};

function defaultResolveName(input: UpdateNoteInput, note: NoteFile): string {
	// Explicit renames always win. Otherwise, keep following the first heading
	// only while the note still looks auto-managed — and only when the caller
	// opts in (`trackHeading !== false`). Autosaves pass `false`, so the filename
	// follows the heading only once the editor commits it (the user leaves the
	// heading block), matching the server backend.
	if (input.name !== undefined) return ensureNoteName(input.name);

	if (
		input.trackHeading !== false &&
		input.content !== undefined &&
		nameTracksHeading(note.name, note.content)
	) {
		const derivedName = deriveNoteNameFromHeading(input.content);
		if (derivedName) return derivedName;
	}

	return note.name;
}

function defaultResolveRichContent(input: UpdateNoteInput, note: NoteFile): RichTextDocument {
	return input.richContent ?? note.richContent;
}

export function applyNoteUpdate(
	note: NoteFile,
	input: UpdateNoteInput,
	options: ApplyNoteUpdateOptions = {},
): NoteFile {
	const { resolveName = defaultResolveName, resolveRichContent = defaultResolveRichContent } =
		options;
	return {
		...note,
		name: resolveName(input, note),
		content: input.content ?? note.content,
		richContent: resolveRichContent(input, note),
		preferredEditorMode: input.preferredEditorMode ?? note.preferredEditorMode,
		parentId: input.parentId !== undefined ? input.parentId : note.parentId,
		sortOrder: input.sortOrder ?? note.sortOrder,
		tags: input.tags ?? note.tags,
		modifiedAt: new Date(),
	};
}

export function folderFromCreateInput(input: CreateFolderInput): NoteFolder {
	return {
		id: input.id ?? crypto.randomUUID(),
		name: input.name,
		parentId: input.parentId ?? null,
		sortOrder: input.sortOrder ?? 0,
		isOpen: true,
	};
}

export function applyFolderUpdate(folder: NoteFolder, input: UpdateFolderInput): NoteFolder {
	return {
		...folder,
		name: input.name ?? folder.name,
		parentId: input.parentId === undefined ? folder.parentId : input.parentId,
		sortOrder: input.sortOrder === undefined ? folder.sortOrder : input.sortOrder,
	};
}

export function collectFolderDescendants(folders: NoteFolder[], rootId: string): Set<string> {
	const descendants = new Set<string>([rootId]);
	const stack = [rootId];
	while (stack.length > 0) {
		const next = stack.pop()!;
		for (const folder of folders) {
			if (folder.parentId === next && !descendants.has(folder.id)) {
				descendants.add(folder.id);
				stack.push(folder.id);
			}
		}
	}
	return descendants;
}
