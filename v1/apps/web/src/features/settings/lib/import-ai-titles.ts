import type { NoteFile } from "@/domain/notes/models";
import { deriveNoteNameFromHeading } from "@/domain/notes/note-links";
import { markdownToRichDocument } from "@/domain/notes/rich-document";

const MIN_TITLE_CANDIDATE_CHARS = 100;
const PARAGRAPH_BREAK_PATTERN = /\S[\s\S]*\n\s*\n[\s\S]*\S/;
const H1_PATTERN = /^#\s+\S.+$/m;
const MAX_TITLE_CHARS = 80;

export type ImportTitleSuggestion = {
	noteId: string;
	noteName: string;
	title: string;
	previewContent: string;
};

export type ImportTitleFailure = {
	noteId: string;
	noteName: string;
	error: string;
};

export type ImportTitleProgress = {
	total: number;
	completed: number;
	succeeded: number;
	failed: number;
	active: number;
	startedAt: number;
};

export type ImportTitleSuggestionResult = {
	eligible: number;
	succeeded: number;
	failed: number;
	suggestions: ImportTitleSuggestion[];
	failures: ImportTitleFailure[];
};

export type CreateImportTitleSuggestionsOptions = {
	concurrency?: number;
	generateTitle: (content: string, note: NoteFile) => Promise<string>;
	onProgress?: (progress: ImportTitleProgress) => void;
	shouldStop?: () => boolean;
};

export function isImportTitleCandidate(note: Pick<NoteFile, "content">): boolean {
	const content = note.content.trim();
	return (
		content.length > MIN_TITLE_CANDIDATE_CHARS &&
		PARAGRAPH_BREAK_PATTERN.test(content) &&
		!H1_PATTERN.test(content)
	);
}

function sanitizeGeneratedTitle(raw: string): string | null {
	const title = raw
		.trim()
		.replace(/^```(?:\w+)?\s*/, "")
		.replace(/\s*```$/, "")
		.replace(/^#+\s*/, "")
		.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_TITLE_CHARS)
		.trim()
		.replace(/[.。:：-]+$/g, "")
		.trim();
	return title || null;
}

export function applyImportTitleSuggestion(note: NoteFile, title: string): NoteFile {
	const content = `# ${title.trim()}\n\n${note.content.trimStart()}`;
	return {
		...note,
		name: deriveNoteNameFromHeading(content) ?? note.name,
		content,
		richContent: markdownToRichDocument(content),
		modifiedAt: new Date(),
	};
}

export async function createImportTitleSuggestions(
	notes: NoteFile[],
	options: CreateImportTitleSuggestionsOptions,
): Promise<ImportTitleSuggestionResult> {
	const candidates = notes.filter(isImportTitleCandidate);
	const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 6));
	const suggestions: ImportTitleSuggestion[] = [];
	const failures: ImportTitleFailure[] = [];
	const startedAt = Date.now();
	let cursor = 0;
	let completed = 0;
	let active = 0;

	const emit = () => {
		options.onProgress?.({
			total: candidates.length,
			completed,
			succeeded: suggestions.length,
			failed: failures.length,
			active,
			startedAt,
		});
	};

	emit();

	async function worker() {
		while (!options.shouldStop?.()) {
			const note = candidates[cursor];
			cursor++;
			if (!note) return;

			active++;
			emit();
			try {
				const title = sanitizeGeneratedTitle(
					await options.generateTitle(note.content, note),
				);
				if (!title) {
					failures.push({
						noteId: note.id,
						noteName: note.name,
						error: "AI returned an empty title.",
					});
				} else {
					suggestions.push({
						noteId: note.id,
						noteName: note.name,
						title,
						previewContent: applyImportTitleSuggestion(note, title).content,
					});
				}
			} catch (error) {
				failures.push({
					noteId: note.id,
					noteName: note.name,
					error: error instanceof Error ? error.message : "Title generation failed.",
				});
			} finally {
				active--;
				completed++;
				emit();
			}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()),
	);

	return {
		eligible: candidates.length,
		succeeded: suggestions.length,
		failed: failures.length,
		suggestions,
		failures,
	};
}
