/**
 * Backfills the note_links edge table for all existing notes.
 *
 * note_links rows are normally written on every note save (syncNoteLinks in
 * src/domain/notes/actions.ts). Notes created before that hook existed have no
 * rows, so the workspace graph is empty until they're re-saved. This script
 * parses every non-deleted note once and populates its edges.
 *
 * Idempotent: it delete-and-replaces edges per note, so it's safe to re-run.
 *
 * Run with: bun scripts/backfill-note-links.ts
 * Uses DATABASE_URL from .env (loaded via dotenv/config).
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
	extractNoteLinks,
	extractNoteTags,
	getNoteSearchableContent,
	normalizeNoteTitle,
} from "../apps/web/src/domain/notes/note-links";
import { normalizeDatabaseUrl } from "../apps/web/src/lib/database-url";

const adapter = new PrismaPg({
	connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL!),
});
const prisma = new PrismaClient({ adapter });

async function main() {
	const notes = await prisma.note.findMany({
		where: { deletedAt: null },
		select: { id: true, userId: true, content: true, richContent: true, tags: true },
	});

	console.log(`Backfilling note_links for ${notes.length} notes…`);

	let edgeCount = 0;
	for (const note of notes) {
		const noteInput = {
			id: note.id,
			content: note.content,
			richContent: note.richContent as unknown,
			tags: note.tags,
		};

		const rows = new Map<
			string,
			{
				userId: string;
				sourceNoteId: string;
				targetNoteId: string | null;
				targetLabel: string;
				kind: string;
			}
		>();

		for (const link of extractNoteLinks(noteInput as never)) {
			const targetLabel = normalizeNoteTitle(link.targetLabel);
			if (!targetLabel) continue;
			rows.set(`${link.kind}:${targetLabel}`, {
				userId: note.userId,
				sourceNoteId: note.id,
				targetNoteId: link.targetNoteId ?? null,
				targetLabel,
				kind: link.kind,
			});
		}

		const tagNames = new Set<string>([
			...extractNoteTags(getNoteSearchableContent(noteInput as never)),
			...note.tags.map((tag) => tag.trim().replace(/^#/, "").toLowerCase()),
		]);
		for (const tag of tagNames) {
			if (!tag) continue;
			rows.set(`tag:${tag}`, {
				userId: note.userId,
				sourceNoteId: note.id,
				targetNoteId: null,
				targetLabel: tag,
				kind: "tag",
			});
		}

		await prisma.$transaction([
			prisma.noteLink.deleteMany({ where: { sourceNoteId: note.id } }),
			...(rows.size > 0 ? [prisma.noteLink.createMany({ data: [...rows.values()] })] : []),
		]);
		edgeCount += rows.size;
	}

	console.log(`Done. Wrote ${edgeCount} edges across ${notes.length} notes.`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
