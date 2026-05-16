import { NextResponse } from "next/server";
import { zipSync, strToU8 } from "fflate";
import { getAuthenticatedUser } from "@/core/supabase/server-client";

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
  return name.replace(/[/\\:*?"<>|]/g, "-").trim();
}

function noteFrontmatter(note: NoteRow): string {
  const lines = ["---"];
  lines.push(`id: ${note.id}`);
  if (note.tags?.length) lines.push(`tags: [${note.tags.map((t) => `"${t}"`).join(", ")}]`);
  lines.push(`created: ${note.created_at}`);
  lines.push(`updated: ${note.updated_at}`);
  lines.push("---", "", "");
  return lines.join("\n");
}

function journalFrontmatter(entry: JournalRow): string {
  const lines = ["---"];
  lines.push(`date: ${entry.date_key}`);
  if (entry.mood) lines.push(`mood: ${entry.mood}`);
  if (entry.tags?.length) lines.push(`tags: [${entry.tags.map((t) => `"${t}"`).join(", ")}]`);
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

  const [foldersRes, notesRes, journalRes] = await Promise.all([
    supabase.from("folders").select("id,name,parent_id").eq("user_id", user.id).is("deleted_at", null),
    supabase.from("notes").select("id,name,content,tags,parent_id,created_at,updated_at").eq("user_id", user.id).is("deleted_at", null),
    supabase.from("journal_entries").select("id,date_key,content,mood,tags").eq("user_id", user.id).is("deleted_at", null).order("date_key", { ascending: true }),
  ]);

  if (foldersRes.error) return NextResponse.json({ error: foldersRes.error.message }, { status: 500 });
  if (notesRes.error) return NextResponse.json({ error: notesRes.error.message }, { status: 500 });
  if (journalRes.error) return NextResponse.json({ error: journalRes.error.message }, { status: 500 });

  const folderPaths = buildFolderPaths((foldersRes.data ?? []) as FolderRow[]);
  const dateSlug = new Date().toISOString().slice(0, 10);
  const root = `skriuw-export-${dateSlug}`;

  const files: Record<string, Uint8Array> = {};

  for (const note of (notesRes.data ?? []) as NoteRow[]) {
    const folderPath = note.parent_id ? folderPaths.get(note.parent_id) : undefined;
    const noteName = safeName(note.name.endsWith(".md") ? note.name : `${note.name}.md`);
    const filePath = folderPath
      ? `${root}/notes/${folderPath}/${noteName}`
      : `${root}/notes/${noteName}`;
    files[filePath] = strToU8(noteFrontmatter(note) + note.content);
  }

  for (const entry of (journalRes.data ?? []) as JournalRow[]) {
    const filePath = `${root}/journal/${entry.date_key}.md`;
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
          notes: notesRes.data?.length ?? 0,
          journalEntries: journalRes.data?.length ?? 0,
        },
      },
      null,
      2,
    ),
  );

  const zip = zipSync(files);

  return new Response(zip.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="skriuw-export-${dateSlug}.zip"`,
      "Content-Length": String(zip.byteLength),
    },
  });
}
