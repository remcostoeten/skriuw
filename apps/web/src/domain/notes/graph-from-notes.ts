import type { NoteFile } from "@/domain/notes/models";
import type { Person } from "@/domain/people/models";
import { buildDesiredNoteLinkRows } from "@/domain/notes/note-link-sync";
import { buildGraphData, type GraphData, type NoteLinkRow } from "@/domain/notes/graph";

/** Builds a workspace graph from in-memory notes (guest/desktop or tests). */
export function buildGraphFromNotes(notes: NoteFile[], people: Person[] = []): GraphData {
	const noteInputs = notes.map((note) => ({
		id: note.id,
		name: note.name,
		createdAt: note.createdAt,
	}));
	const links: NoteLinkRow[] = [];

	for (const note of notes) {
		for (const row of buildDesiredNoteLinkRows("local", note)) {
			links.push({
				sourceNoteId: row.sourceNoteId,
				targetNoteId: row.targetNoteId ?? null,
				targetLabel: row.targetLabel,
				kind: row.kind,
			});
		}
	}

	return buildGraphData(noteInputs, links, {
		people: people.map((person) => ({ id: person.id, name: person.name })),
	});
}
