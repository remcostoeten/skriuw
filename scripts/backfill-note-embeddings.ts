import { prisma } from "@/lib/prisma";
import { createNoteEmbedding } from "@/features/notes/server/semantic-embeddings";

const notes = await prisma.note.findMany({
	where: { deletedAt: null, semanticEmbedding: null },
	select: { id: true, name: true, content: true },
});

for (const note of notes) {
	const embedding = await createNoteEmbedding(note.name, note.content);
	if (!embedding) throw new Error("GEMINI_API_KEY is required to backfill semantic search.");
	await prisma.note.update({ where: { id: note.id }, data: { semanticEmbedding: embedding } });
	console.log(`Indexed ${note.name}`);
}

console.log(`Indexed ${notes.length} notes.`);
