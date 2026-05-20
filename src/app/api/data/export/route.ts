import { NextResponse } from "next/server";
import { zipSync, strToU8 } from "fflate";
import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { isMissingNotesTagsColumnError } from "@/domain/notes/schema-compat";

type FolderRow = { id: string; name: string; parent_id: string | null };
type NoteRow = {
	id: string;
	name: string;
	content: string;
	tags: string[] | null;
	parent_id: string | null;
	created_at: string;
	updated_at: string;
};
type JournalRow = {
	id: string;
	date_key: string;
	content: string;
	mood: string | null;
	tags: string[] | null;
};

const NOTE_EXPORT_SELECT = "id,name,content,tags,parent_id,created_at,updated_at";
const NOTE_EXPORT_SELECT_LEGACY = "id,name,content,parent_id,created_at,updated_at";

function buildFolderPaths(folders: FolderRow[]): Map<string, string> {
	const byId = new Map(folders.map((f) => [f.id, f]));
	const cache = new Map<string, string>();

	function getPath(id: string): string {
		if (cache.has(id)) return cache.get(id)!;
		const folder = byId.get(id);
		if (!folder) return "";
		const parent = folder.parent_id ? getPath(folder.parent_id) : "";
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
	// Wrap in double quotes and escape internal quotes and newlines
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
	if (note.tags?.length) lines.push(`tags: [${note.tags.map(yamlString).join(", ")}]`);
	lines.push(`created: ${note.created_at}`);
	lines.push(`updated: ${note.updated_at}`);
	lines.push("---", "", "");
	return lines.join("\n");
}

function journalFrontmatter(entry: JournalRow): string {
	const lines = ["---"];
	lines.push(`date: ${entry.date_key}`);
	if (entry.mood) lines.push(`mood: ${yamlString(entry.mood)}`);
	if (entry.tags?.length) lines.push(`tags: [${entry.tags.map(yamlString).join(", ")}]`);
	lines.push("---", "", "");
	return lines.join("\n");
}

export async function GET() {
	const { supabase, user } = await getAuthenticatedUser().catch(() => ({
		supabase: null,
		user: null,
	}));

	if (!supabase || !user) {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const [foldersRes, initialNotesRes, journalRes] = await Promise.all([
		supabase
			.from("folders")
			.select("id,name,parent_id")
			.eq("user_id", user.id)
			.is("deleted_at", null),
		supabase
			.from("notes")
			.select(NOTE_EXPORT_SELECT)
			.eq("user_id", user.id)
			.is("deleted_at", null),
		supabase
			.from("journal_entries")
			.select("id,date_key,content,mood,tags")
			.eq("user_id", user.id)
			.is("deleted_at", null)
			.order("date_key", { ascending: true }),
	]);

	let notesData = initialNotesRes.data as NoteRow[] | null;
	let notesError = initialNotesRes.error;
	if (notesError && isMissingNotesTagsColumnError(notesError)) {
		const fallbackNotesRes = await supabase
			.from("notes")
			.select(NOTE_EXPORT_SELECT_LEGACY)
			.eq("user_id", user.id)
			.is("deleted_at", null);
		notesData = fallbackNotesRes.data as NoteRow[] | null;
		notesError = fallbackNotesRes.error;
	}

	if (foldersRes.error)
		return NextResponse.json({ error: foldersRes.error.message }, { status: 500 });
	if (notesError) return NextResponse.json({ error: notesError.message }, { status: 500 });
	if (journalRes.error)
		return NextResponse.json({ error: journalRes.error.message }, { status: 500 });

	const folderPaths = buildFolderPaths((foldersRes.data ?? []) as FolderRow[]);
	const dateSlug = new Date().toISOString().slice(0, 10);
	const root = `skriuw-export-${dateSlug}`;

	const files: Record<string, Uint8Array> = {};

	for (const note of notesData ?? []) {
		const folderPath = note.parent_id ? folderPaths.get(note.parent_id) : undefined;
		const noteName = safeName(note.name.endsWith(".md") ? note.name : `${note.name}.md`);
		const desired = folderPath
			? `${root}/notes/${folderPath}/${noteName}`
			: `${root}/notes/${noteName}`;
		const filePath = uniquePath(files, desired);
		files[filePath] = strToU8(noteFrontmatter(note) + note.content);
	}

	for (const entry of (journalRes.data ?? []) as JournalRow[]) {
		const desired = `${root}/journal/${entry.date_key}.md`;
		const filePath = uniquePath(files, desired);
		files[filePath] = strToU8(journalFrontmatter(entry) + entry.content);
	}

	// Manifest so future importers can identify source
	files[`${root}/skriuw-export.json`] = strToU8(
		JSON.stringify(
			{
				version: 1,
				source: "skriuw",
				exportedAt: new Date().toISOString(),
				counts: {
					notes: notesData?.length ?? 0,
					journalEntries: journalRes.data?.length ?? 0,
				},
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
