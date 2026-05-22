import { NextResponse } from "next/server";
import { zipSync, strToU8 } from "fflate";
import { getAuthenticatedUser } from "@/core/db";

type FolderRow = { id: string; name: string; parentId: string | null };
type NoteRow = {
	id: string;
	name: string;
	content: string;
	tags: string[];
	parentId: string | null;
	createdAt: Date;
	updatedAt: Date;
};
type JournalRow = {
	id: string;
	dateKey: string;
	content: string;
	mood: string | null;
	tags: string[];
};

function buildFolderPaths(folders: FolderRow[]): Map<string, string> {
	const byId = new Map(folders.map((f) => [f.id, f]));
	const cache = new Map<string, string>();

	function getPath(id: string): string {
		if (cache.has(id)) return cache.get(id)!;
		const folder = byId.get(id);
		if (!folder) return "";
		const parent = folder.parentId ? getPath(folder.parentId) : "";
		const path = parent ? `${parent}/${folder.name}` : folder.name;
		cache.set(id, path);
		return path;
	}

	for (const f of folders) getPath(f.id);
	return cache;
}

function safeName(name: string): string {
	const sanitized = name.replace(/[/\\:*?"<>|]/g, "-").trim();
	return sanitized || "untitled";
}

function yamlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function uniquePath(files: Record<string, Uint8Array>, desired: string): string {
	if (!(desired in files)) return desired;
	const dot = desired.lastIndexOf(".");
	const base = dot !== -1 ? desired.slice(0, dot) : desired;
	const ext = dot !== -1 ? desired.slice(dot) : "";
	let i = 2;
	while (`${base}-${i}${ext}` in files) i++;
	return `${base}-${i}${ext}`;
}

function noteFrontmatter(note: NoteRow): string {
	const lines = ["---"];
	lines.push(`id: ${note.id}`);
	if (note.tags.length) lines.push(`tags: [${note.tags.map(yamlString).join(", ")}]`);
	lines.push(`created: ${note.createdAt.toISOString()}`);
	lines.push(`updated: ${note.updatedAt.toISOString()}`);
	lines.push("---", "", "");
	return lines.join("\n");
}

function journalFrontmatter(entry: JournalRow): string {
	const lines = ["---"];
	lines.push(`date: ${entry.dateKey}`);
	if (entry.mood) lines.push(`mood: ${yamlString(entry.mood)}`);
	if (entry.tags.length) lines.push(`tags: [${entry.tags.map(yamlString).join(", ")}]`);
	lines.push("---", "", "");
	return lines.join("\n");
}

export async function GET() {
	let prismaClient: Awaited<ReturnType<typeof getAuthenticatedUser>>["prisma"];
	let userId: string;
	try {
		const { prisma, user } = await getAuthenticatedUser();
		prismaClient = prisma;
		userId = user.id;
	} catch {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const [folders, notes, journalEntries] = await Promise.all([
		prismaClient.folder.findMany({
			where: { userId, deletedAt: null },
			select: { id: true, name: true, parentId: true },
		}),
		prismaClient.note.findMany({
			where: { userId, deletedAt: null },
			select: {
				id: true,
				name: true,
				content: true,
				tags: true,
				parentId: true,
				createdAt: true,
				updatedAt: true,
			},
		}),
		prismaClient.journalEntry.findMany({
			where: { userId, deletedAt: null },
			orderBy: { dateKey: "asc" },
			select: { id: true, dateKey: true, content: true, mood: true, tags: true },
		}),
	]);

	const folderPaths = buildFolderPaths(folders);
	const dateSlug = new Date().toISOString().slice(0, 10);
	const root = `skriuw-export-${dateSlug}`;
	const files: Record<string, Uint8Array> = {};

	for (const note of notes as NoteRow[]) {
		const folderPath = note.parentId ? folderPaths.get(note.parentId) : undefined;
		const noteName = safeName(note.name.endsWith(".md") ? note.name : `${note.name}.md`);
		const desired = folderPath
			? `${root}/notes/${folderPath}/${noteName}`
			: `${root}/notes/${noteName}`;
		const filePath = uniquePath(files, desired);
		files[filePath] = strToU8(noteFrontmatter(note) + note.content);
	}

	for (const entry of journalEntries as JournalRow[]) {
		const desired = `${root}/journal/${entry.dateKey}.md`;
		const filePath = uniquePath(files, desired);
		files[filePath] = strToU8(journalFrontmatter(entry) + entry.content);
	}

	files[`${root}/skriuw-export.json`] = strToU8(
		JSON.stringify(
			{
				version: 1,
				source: "skriuw",
				exportedAt: new Date().toISOString(),
				counts: { notes: notes.length, journalEntries: journalEntries.length },
			},
			null,
			2,
		),
	);

	const zip = zipSync(files);
	const blob = new Blob([zip]);

	return new Response(blob, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": `attachment; filename="skriuw-export-${dateSlug}.zip"`,
			"Content-Length": String(blob.size),
			"Cache-Control": "no-store",
		},
	});
}
