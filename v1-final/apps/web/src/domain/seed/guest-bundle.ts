import type { ActiveSeedBundle } from "@/domain/seed/queries";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import type { NoteEditorMode, NoteFile, NoteFolder, RichTextDocument } from "@/domain/notes/models";

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
	noteDetails: NoteFile[];
	folders: NoteFolder[];
};

/**
 * Server-only loader that converts the active seed bundle into the same
 * NoteFile/NoteFolder shapes the rest of the app consumes. Used to hydrate
 * the React Query cache for unauthenticated visitors so guest mode reads
 * pre-seeded content without touching the database for that visitor.
 */
export async function loadGuestWorkspaceSnapshot(): Promise<GuestWorkspaceSnapshot> {
	const { loadActiveSeedBundle } = await import("@/domain/seed/queries");
	const bundle = await loadActiveSeedBundle();
	if (!bundle) {
		return { notes: [], noteDetails: [], folders: [] };
	}
	return seedBundleToSnapshot(bundle);
}

export async function loadGuestSeedNote(id: string): Promise<NoteFile | null> {
	const { loadActiveSeedBundle } = await import("@/domain/seed/queries");
	const bundle = await loadActiveSeedBundle();
	if (!bundle) return null;
	return seedBundleToNoteDetails(bundle).find((note) => note.id === id) ?? null;
}

function seedBundleToFolders(bundle: ActiveSeedBundle): NoteFolder[] {
	return bundle.payload.folders.map((folder) => ({
		id: refToId(folder.ref),
		name: folder.name,
		parentId: folder.parentRef ? refToId(folder.parentRef) : null,
		sortOrder: folder.order,
		isOpen: true,
	}));
}

function seedBundleToNoteDetails(bundle: ActiveSeedBundle): NoteFile[] {
	const timestamp = seedTimestamp(bundle);
	return bundle.payload.notes.map((note) => {
		const richContent = (note.richContent ?? []) as RichTextDocument;
		const content = note.content?.trim() ?? "";
		const fallbackRich =
			richContent.length === 0 ? markdownToRichDocument(content) : richContent;
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
}

function noteToMetadata(note: NoteFile): NoteFile {
	return {
		...note,
		content: "",
		richContent: [],
		journalMeta: undefined,
	};
}

export function seedBundleToSnapshot(bundle: ActiveSeedBundle): GuestWorkspaceSnapshot {
	const noteDetails = seedBundleToNoteDetails(bundle);

	return {
		notes: noteDetails.map(noteToMetadata),
		noteDetails,
		folders: seedBundleToFolders(bundle),
	};
}
