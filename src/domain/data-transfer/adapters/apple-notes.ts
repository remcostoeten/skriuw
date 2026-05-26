import { normalizeNoteFileName } from "@/domain/data-transfer/paths";
import {
	buildMarkdownImportArchive,
	inferImportFolders,
} from "@/domain/data-transfer/adapters/markdown-import-shared";
import type { ParsedNoteFile } from "@/domain/data-transfer/types";

function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<\/h[1-6]>/gi, "\n\n")
		.replace(/<li>/gi, "- ")
		.replace(/<\/li>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function titleFromAppleNotesPath(path: string): string {
	const base = path.split("/").pop() ?? "note.html";
	return base.replace(/\.html?$/i, "").replace(/_/g, " ").trim() || "Untitled";
}

function parseAppleNotesHtml(path: string, html: string): ParsedNoteFile {
	const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const headingMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
	const rawTitle = stripHtml(titleMatch?.[1] ?? headingMatch?.[1] ?? titleFromAppleNotesPath(path));
	const parts = path.split("/").filter(Boolean);
	const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
	const content = stripHtml(html);
	const name = normalizeNoteFileName(`${rawTitle || titleFromAppleNotesPath(path)}.md`);

	return {
		name,
		content: content || rawTitle || "Imported from Apple Notes",
		tags: [],
		parentPath,
		preferredEditorMode: "raw",
		sourcePath: path,
	};
}

export function parseAppleNotesEntries(entries: Record<string, string>) {
	const notes: ParsedNoteFile[] = [];

	for (const [path, raw] of Object.entries(entries)) {
		if (!/\.html?$/i.test(path)) continue;
		if (path.toLowerCase().includes("/.trash/")) continue;
		notes.push(parseAppleNotesHtml(path, raw));
	}

	return buildMarkdownImportArchive(notes, "apple-notes", [
		"Imported from Apple Notes HTML export.",
		"Formatting was simplified to plain text/Markdown.",
		"Images, attachments, and checklists may need manual cleanup.",
	]);
}

export { inferImportFolders as inferAppleNotesFolders };
