import { loadActiveSeedBundle, type ActiveSeedBundle } from "@/domain/seed/queries";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import type {
	NoteEditorMode,
	NoteFile,
	NoteFolder,
	RichTextDocument,
} from "@/domain/notes/models";

function mapEditorMode(mode: "block" | "markdown" | undefined): NoteEditorMode {
	return mode === "markdown" ? "raw" : "block";
}

const REF_ID_PREFIX = "guest:";

function refToId(ref: string): string {
	return `${REF_ID_PREFIX}${ref}`;
}

function seedTimestamp(bundle: ActiveSeedBundle): Date {
	return new Date(bundle.updatedAt);
}

export type GuestWorkspaceSnapshot = {
	notes: NoteFile[];
	folders: NoteFolder[];
};

/**
 * Server-only loader that converts the active seed bundle into the same
 * NoteFile/NoteFolder shapes the rest of the app consumes. Used to hydrate
 * the React Query cache for unauthenticated visitors so guest mode reads
 * pre-seeded content without touching the database for that visitor.
 */
export async function loadGuestWorkspaceSnapshot(): Promise<GuestWorkspaceSnapshot> {
	const bundle = await loadActiveSeedBundle();
	if (!bundle) {
		return { notes: [], folders: [] };
	}
	return seedBundleToSnapshot(bundle);
}

export function seedBundleToSnapshot(bundle: ActiveSeedBundle): GuestWorkspaceSnapshot {
	const { folders, notes } = bundle.payload;
	const timestamp = seedTimestamp(bundle);

	const mappedFolders: NoteFolder[] = folders.map((folder) => ({
		id: refToId(folder.ref),
		name: folder.name,
		parentId: folder.parentRef ? refToId(folder.parentRef) : null,
		sortOrder: folder.order,
		isOpen: true,
	}));

	const mappedNotes: NoteFile[] = notes.map((note) => {
		const richContent = (note.richContent ?? []) as RichTextDocument;
		const content = note.content?.trim() ?? "";
		const fallbackRich = richContent.length === 0 ? markdownToRichDocument(content) : richContent;
		return {
			id: refToId(note.ref),
			name: note.name,
			content,
			richContent: fallbackRich,
			preferredEditorMode: mapEditorMode(note.preferredEditorMode),
			createdAt: timestamp,
			modifiedAt: timestamp,
			parentId: note.parentRef ? refToId(note.parentRef) : null,
			sortOrder: note.order,
			tags: note.tags ?? [],
		};
	});

	return { notes: mappedNotes, folders: mappedFolders };
}
