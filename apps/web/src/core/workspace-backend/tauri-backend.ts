import type { UpdateNoteResult } from "@/domain/notes/actions";
import type { NoteFile, NoteFolder, NoteVersion, NoteVersionReason } from "@/domain/notes/models";
import { normalizeNoteProperties, type NotePropertyColor } from "@/domain/notes/properties";
import {
	rewriteNoteForPerson,
	rewriteNoteForTag,
	type NoteChipPatch,
} from "@/domain/notes/chip-rewrite";
import { buildDesiredNoteLinkRows } from "@/domain/notes/note-link-sync";
import {
	buildDesiredJournalLinkRows,
	buildPersonNameResolutionMap,
} from "@/domain/journal/journal-link-sync";
import { normalizeStoredTagEntry, normalizeTagName } from "@/domain/tags/normalize";
import type { JournalEntry, JournalTag, MoodLevel } from "@/domain/journal/models";
import { buildGraphData, type JournalLinkRow } from "@/domain/notes/graph";
import {
	resolveRichDocument,
	richDocumentToSearchableMarkdown,
} from "@/domain/notes/rich-document";
import {
	buildNoteBacklinks,
	extractNoteLinks,
	getNoteTitle,
	normalizeNoteTitle,
} from "@/domain/notes/note-links";
import type { NoteLink, ResolvedNoteLink } from "@/domain/notes/note-links";
import { parseSearchQuery } from "@/domain/notes/search-query";
import type { Person } from "@/domain/people/models";
import type { Task } from "@/domain/tasks/models";
import {
	applyFolderUpdate,
	applyNoteUpdate,
	folderFromCreateInput,
	noteFromCreateInput,
} from "./note-builders";
import type {
	CoverImage,
	NoteSearchHit,
	TaggedNoteSummary,
	TrashBatch,
	WorkspaceBackend,
} from "./types";
import { createWriteQueue } from "./write-queue";

/** The Rust `CoverImageEntry` wire shape — one stored cover image. */
type RustCoverImage = {
	fileName: string;
	size: number;
	modifiedMs: number;
};

/** The Rust `TrashRecord` wire shape — one soft-deleted note or folder. */
type RustTrashRecord = {
	batchId: string;
	kind: "note" | "folder";
	id: string;
	name: string;
	parentId: string | null;
	sortOrder: number;
	deletedAt: number;
};

function trashRecordsToBatches(records: RustTrashRecord[]): TrashBatch[] {
	const groups = new Map<string, RustTrashRecord[]>();
	for (const record of records) {
		const group = groups.get(record.batchId) ?? [];
		group.push(record);
		groups.set(record.batchId, group);
	}

	const batches: TrashBatch[] = [];
	for (const [batchId, group] of groups) {
		const folderRecords = group.filter((record) => record.kind === "folder");
		const isFolder = folderRecords.length > 0;
		const rootFolderId = batchId.startsWith("folder:") ? batchId.slice("folder:".length) : null;
		const primary =
			(isFolder ? folderRecords.find((record) => record.id === rootFolderId) : group[0]) ??
			group[0];
		batches.push({
			id: batchId,
			deletedAt: new Date(Math.max(...group.map((record) => record.deletedAt))),
			kind: isFolder ? "folder" : "note",
			primary: { id: primary.id, name: primary.name },
			noteCount: group.filter((record) => record.kind === "note").length,
			folderCount: folderRecords.length,
		});
	}

	return batches.sort((left, right) => right.deletedAt.getTime() - left.deletedAt.getTime());
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

/** Mirror of Tauri's `Channel` for streaming command events (install/pull progress). */
export type TauriChannel<T> = {
	onmessage: (message: T) => void;
};

type TauriChannelCtor = new <T>() => TauriChannel<T>;

type TauriGlobal = {
	__TAURI__?: { core?: { invoke?: TauriInvoke; Channel?: TauriChannelCtor } };
};

/** The Rust `Note` wire shape — timestamps as epoch-millis, JSON `richContent`. */
type RustNote = {
	id: string;
	name: string;
	content: string;
	richContent: NoteFile["richContent"];
	preferredEditorMode: NoteFile["preferredEditorMode"];
	parentId: string | null;
	sortOrder: number;
	tags: string[];
	properties: NoteFile["properties"];
	icon?: string;
	cover?: string;
	annotationScene: string;
	createdAt: number;
	modifiedAt: number;
};

/** The Rust `NoteMetadata` wire shape — a `RustNote` without its body columns. */
type RustNoteMetadata = Omit<RustNote, "content" | "richContent" | "annotationScene">;

type RustFolder = {
	id: string;
	name: string;
	parentId: string | null;
	sortOrder: number;
	isOpen: boolean;
};

/** The Rust `NoteVersion` wire shape — timestamp as epoch-millis. */
type RustNoteVersion = {
	id: string;
	noteId: string;
	name: string;
	content: string;
	richContent: NoteFile["richContent"];
	preferredEditorMode: NoteFile["preferredEditorMode"];
	parentId: string | null;
	tags: string[];
	properties: NoteFile["properties"];
	reason: string;
	contentHash: string;
	createdAt: number;
};

type RustVersionWriteResult = {
	versionId: string | null;
	versionChanged: boolean;
};

type RustRestoreVersionResult = {
	note: RustNote | null;
	versionCreated: boolean;
};

/** True when running inside the Tauri webview (vs. a browser tab). */
export function isTauriRuntime(): boolean {
	if (typeof window === "undefined") return false;
	return Boolean((window as TauriGlobal).__TAURI__?.core?.invoke);
}

function getInvoke(): TauriInvoke {
	const invoke = (globalThis as TauriGlobal).__TAURI__?.core?.invoke;
	if (!invoke) {
		throw new Error("Tauri IPC is unavailable — tauriBackend used outside the desktop shell");
	}
	return invoke;
}

/** Invoke a Tauri command from anywhere (settings, etc.). Desktop-only. */
export function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
	return getInvoke()<T>(command, args);
}

/**
 * Build a Tauri IPC channel for commands that stream events (Ollama install and
 * model-pull progress). Pass the returned object as a command arg; `onMessage`
 * fires for every event the Rust side sends. Desktop-only.
 */
export function tauriChannel<T>(onMessage: (message: T) => void): TauriChannel<T> {
	const Channel = (globalThis as TauriGlobal).__TAURI__?.core?.Channel;
	if (!Channel) {
		throw new Error("Tauri Channel is unavailable — used outside the desktop shell");
	}
	const channel = new Channel<T>();
	channel.onmessage = onMessage;
	return channel;
}

function toRustNote(note: NoteFile): RustNote {
	return {
		id: note.id,
		name: note.name,
		content: note.content,
		richContent: note.richContent,
		preferredEditorMode: note.preferredEditorMode,
		parentId: note.parentId ?? null,
		sortOrder: note.sortOrder ?? 0,
		tags: note.tags ?? [],
		properties: normalizeNoteProperties(note.properties),
		icon: note.icon,
		cover: note.cover,
		annotationScene: note.annotationScene ?? "",
		createdAt: note.createdAt.getTime(),
		modifiedAt: note.modifiedAt.getTime(),
	};
}

function fromRustNote(raw: RustNote): NoteFile {
	return {
		id: raw.id,
		name: raw.name,
		content: raw.content,
		// The markdown vault is the source of truth and does not persist
		// `richContent`; when the index returns an empty rich document (e.g. a
		// note adopted from an external `.md` edit), derive blocks from the body.
		richContent: resolveRichDocument(raw.content, raw.richContent),
		preferredEditorMode: raw.preferredEditorMode,
		parentId: raw.parentId,
		sortOrder: raw.sortOrder,
		tags: raw.tags,
		properties: normalizeNoteProperties(raw.properties),
		icon: raw.icon,
		cover: raw.cover,
		annotationScene: raw.annotationScene || undefined,
		createdAt: new Date(raw.createdAt),
		modifiedAt: new Date(raw.modifiedAt),
	};
}

/**
 * Maps a body-free list row to the `NoteFile` shape with empty body fields,
 * mirroring the web backend's `recordToNoteMetadata`. Deliberately skips
 * `resolveRichDocument` — the repair walk over BlockNote JSON is what made
 * materializing the full list expensive.
 */
function fromRustNoteMetadata(raw: RustNoteMetadata): NoteFile {
	return {
		id: raw.id,
		name: raw.name,
		content: "",
		richContent: [],
		preferredEditorMode: raw.preferredEditorMode,
		parentId: raw.parentId,
		sortOrder: raw.sortOrder,
		tags: raw.tags,
		properties: normalizeNoteProperties(raw.properties),
		icon: raw.icon,
		createdAt: new Date(raw.createdAt),
		modifiedAt: new Date(raw.modifiedAt),
	};
}

function fromRustNoteVersion(raw: RustNoteVersion): NoteVersion {
	return {
		id: raw.id,
		noteId: raw.noteId,
		name: raw.name,
		content: raw.content,
		richContent: raw.richContent,
		preferredEditorMode: raw.preferredEditorMode,
		createdAt: new Date(raw.createdAt),
		parentId: raw.parentId,
		tags: raw.tags,
		properties: normalizeNoteProperties(raw.properties),
		reason: raw.reason as NoteVersionReason,
		contentHash: raw.contentHash,
	};
}

function toRustFolder(folder: NoteFolder): RustFolder {
	return {
		id: folder.id,
		name: folder.name,
		parentId: folder.parentId ?? null,
		sortOrder: folder.sortOrder ?? 0,
		isOpen: folder.isOpen,
	};
}

function fromRustFolder(raw: RustFolder): NoteFolder {
	return {
		id: raw.id,
		name: raw.name,
		parentId: raw.parentId,
		sortOrder: raw.sortOrder,
		isOpen: raw.isOpen,
	};
}

/** The Rust `JournalEntry` wire shape — timestamps as epoch-millis, `mood` null when absent. */
type RustJournalEntry = {
	id: string;
	dateKey: string;
	title: string | null;
	content: string;
	richContent: JournalEntry["richContent"];
	tags: string[];
	mood: string | null;
	createdAt: number;
	updatedAt: number;
};

type RustJournalTag = {
	id: string;
	name: string;
	color: string;
	usageCount: number;
};

type RustTask = Omit<
	Task,
	"dueDate" | "sourceNoteId" | "sourceBlockId" | "createdAt" | "updatedAt"
> & {
	dueDate: string | null;
	sourceNoteId: string | null;
	sourceBlockId: string | null;
	createdAt: number;
	updatedAt: number;
};

function fromRustTask(raw: RustTask): Task {
	return {
		...raw,
		dueDate: raw.dueDate ?? undefined,
		sourceNoteId: raw.sourceNoteId ?? undefined,
		sourceBlockId: raw.sourceBlockId ?? undefined,
		createdAt: new Date(raw.createdAt),
		updatedAt: new Date(raw.updatedAt),
	};
}

function toRustTask(task: Task): RustTask {
	return {
		...task,
		dueDate: task.dueDate ?? null,
		sourceNoteId: task.sourceNoteId ?? null,
		sourceBlockId: task.sourceBlockId ?? null,
		createdAt: task.createdAt.getTime(),
		updatedAt: task.updatedAt.getTime(),
	};
}

function toRustJournalEntry(entry: JournalEntry): RustJournalEntry {
	return {
		id: entry.id,
		dateKey: entry.dateKey,
		title: entry.title ?? null,
		content: entry.content,
		richContent: entry.richContent ?? [],
		tags: entry.tags,
		mood: entry.mood ?? null,
		createdAt: entry.createdAt.getTime(),
		updatedAt: entry.updatedAt.getTime(),
	};
}

function fromRustJournalEntry(raw: RustJournalEntry): JournalEntry {
	return {
		id: raw.id,
		dateKey: raw.dateKey,
		title: raw.title ?? undefined,
		content: raw.content,
		richContent: raw.richContent ?? undefined,
		tags: raw.tags,
		mood: (raw.mood ?? undefined) as MoodLevel | undefined,
		createdAt: new Date(raw.createdAt),
		updatedAt: new Date(raw.updatedAt),
	};
}

function fromRustJournalTag(raw: RustJournalTag): JournalTag {
	return {
		id: raw.id,
		name: raw.name,
		color: raw.color,
		usageCount: raw.usageCount,
	};
}

type RustNoteLink = {
	kind: NoteLink["kind"] | "tag" | "person";
	raw: string;
	targetLabel: string;
	alias: string | null;
	targetNoteId: string | null;
	targetTitleKey: string | null;
};

/** The Rust `TaggedNoteSummaryRow` wire shape. */
type RustTaggedNoteSummary = {
	id: string;
	name: string;
	modifiedAt: number;
};

/** The Rust `NoteLinkRow` wire shape — the graph builder's link input. */
type RustGraphLinkRow = {
	sourceNoteId: string;
	targetNoteId: string | null;
	targetLabel: string;
	kind: string;
};

function fromRustTaggedNoteSummary(raw: RustTaggedNoteSummary): TaggedNoteSummary {
	return { id: raw.id, name: raw.name, modifiedAt: new Date(raw.modifiedAt), kind: "note" };
}

function journalToTaggedSummary(entry: JournalEntry): TaggedNoteSummary {
	return {
		id: entry.id,
		name: entry.title?.trim() || entry.dateKey,
		modifiedAt: entry.updatedAt,
		kind: "journal",
		dateKey: entry.dateKey,
	};
}

type RustBacklinkSource = {
	note: RustNote;
	kind: NoteLink["kind"];
	raw: string;
	targetLabel: string;
	alias: string | null;
	matchedNoteId: boolean;
};

type RustBacklinkSources = {
	sources: RustBacklinkSource[];
	ambiguousTitleKeys: string[];
};

function noteTitleKeys(note: NoteFile): string[] {
	const keys = new Set<string>();
	for (const candidate of [
		normalizeNoteTitle(note.name),
		normalizeNoteTitle(getNoteTitle(note)),
	]) {
		if (candidate) keys.add(candidate);
	}
	return [...keys];
}

function toRustNoteLink(link: NoteLink): RustNoteLink {
	return {
		kind: link.kind,
		raw: link.raw,
		targetLabel: link.targetLabel,
		alias: link.alias ?? null,
		targetNoteId: link.targetNoteId ?? null,
		targetTitleKey: link.targetNoteId ? null : normalizeNoteTitle(link.targetLabel),
	};
}

/**
 * The full persisted link-row set for a note: wiki/markdown rows from
 * `extractNoteLinks` (keeping raw/alias/title-key fidelity for backlink
 * resolution) plus the `tag`/`person` membership rows the web Prisma index
 * also stores — so the SQL aggregations (tag pages, person pages, graph) see
 * the same data on desktop as on the web.
 *
 * Falls back to scanning `richContent` for noteLink chips when the
 * markdown `content` doesn't contain the serialised `[[wiki]]` form yet
 * (e.g. a block-only note that was just created and hasn't been through a
 * full markdown round-trip).
 */
function buildRustNoteLinkRows(note: NoteFile): RustNoteLink[] {
	const rows: RustNoteLink[] = [];

	const contentLinks = extractNoteLinks(note);
	const seen = new Set<string>();

	for (const link of contentLinks) {
		seen.add(`${link.kind}:${normalizeNoteTitle(link.targetLabel)}`);
		rows.push(toRustNoteLink(link));
	}

	// When content is empty the link extractor already falls through to
	// richContent, but when content has unrelated text without the wiki
	// link the noteLink chips in richContent would be missed — extract
	// them explicitly and merge.
	const content = note.content?.trim();
	const richMarkdown = content ? richDocumentToSearchableMarkdown(note.richContent) : "";
	if (richMarkdown) {
		const fallback: NoteFile = { ...note, content: richMarkdown };
		for (const link of extractNoteLinks(fallback)) {
			const key = `${link.kind}:${normalizeNoteTitle(link.targetLabel)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			rows.push(toRustNoteLink(link));
		}
	}

	for (const row of buildDesiredNoteLinkRows("local", note)) {
		if (row.kind !== "tag" && row.kind !== "person") continue;
		rows.push({
			kind: row.kind,
			raw: row.kind === "tag" ? `#${row.targetLabel}` : row.targetLabel,
			targetLabel: row.targetLabel,
			alias: null,
			targetNoteId: null,
			targetTitleKey: null,
		});
	}
	return rows;
}

/**
 * Backfills the SQLite link index for notes that have no link rows yet — bulk
 * imports and reconcile-adopted external edits write notes without going
 * through `save_note`, so their links/title keys are missing and backlinks
 * silently under-report. Link extraction semantics live in TS, so Rust only
 * reports which notes are unindexed and stores the result (one transaction
 * per batch). Desktop-only; runs after the launch reconcile. Returns the
 * number of notes indexed.
 */
export async function backfillMissingNoteLinks(): Promise<number> {
	const invoke = getInvoke();
	const ids = await invoke<string[]>("list_unindexed_note_ids");
	if (ids.length === 0) return 0;

	const BATCH_SIZE = 100;
	const batches: string[][] = [];
	for (let start = 0; start < ids.length; start += BATCH_SIZE) {
		batches.push(ids.slice(start, start + BATCH_SIZE));
	}
	await Promise.all(
		batches.map(async (batchIds) => {
			const rows = await invoke<RustNote[]>("get_notes", { ids: batchIds });
			const entries = rows.map((raw) => {
				const note = fromRustNote(raw);
				return {
					noteId: note.id,
					links: buildRustNoteLinkRows(note),
					titleKeys: noteTitleKeys(note),
				};
			});
			if (entries.length > 0) {
				await invoke("replace_note_links_bulk", { entries });
			}
		}),
	);
	return ids.length;
}

/**
 * The final resolution of a SQL-prefiltered backlink source into the exact
 * `ResolvedNoteLink` shape `buildNoteBacklinks` produces: always `resolved`,
 * pointing at the active note, carrying the source's link fields.
 */
function backlinkFromSource(source: RustBacklinkSource, activeId: string): ResolvedNoteLink {
	return {
		raw: source.raw,
		kind: source.kind,
		sourceNoteId: source.note.id,
		targetLabel: source.targetLabel,
		alias: source.alias ?? undefined,
		status: "resolved",
		targetNoteId: activeId,
	};
}

/**
 * Desktop backend: every read and mutation crosses the Tauri IPC boundary to a
 * local Rust + SQLite store. Record building (ids, defaults, timestamps) and
 * the derived graph/backlink views reuse the same pure helpers as the guest
 * `localBackend`, so a note edited on desktop is byte-identical to one edited
 * as a guest. Cloud-only features are capability-gated off, like guest mode.
 */
export function createTauriBackend(): WorkspaceBackend {
	const invoke = getInvoke();

	// Per-id write queue: `updateNote`/`updateFolder` do an IPC read, a JS
	// merge, then an IPC write. Without serialization, two near-simultaneous
	// updates to the same id (e.g. a drag-to-move and an in-flight autosave)
	// can interleave between the read and the write and silently clobber each
	// other. Chaining same-id calls onto one promise closes that window;
	// different ids run unserialized. Shared with the guest backend — see
	// `write-queue.ts` for the cross-backend concurrency contract.
	const { runExclusive } = createWriteQueue();

	// The public list is metadata-only (matching the web backend): the sidebar
	// and every other list consumer never reads bodies, and shipping content +
	// richContent for the whole vault over JSON IPC costs megabytes per call.
	async function listNotes(): Promise<NoteFile[]> {
		const rows = await invoke<RustNoteMetadata[]>("list_note_metadata");
		return rows.map(fromRustNoteMetadata);
	}

	// Full rows for the aggregation paths (graph, tag/person scans, rewrites)
	// that genuinely read every note's body.
	async function listNotesWithBodies(): Promise<NoteFile[]> {
		const rows = await invoke<RustNote[]>("list_notes");
		return rows.map(fromRustNote);
	}

	async function listFolders(): Promise<NoteFolder[]> {
		const rows = await invoke<RustFolder[]>("list_folders");
		return rows.map(fromRustFolder);
	}

	async function listJournalEntries(): Promise<JournalEntry[]> {
		const rows = await invoke<RustJournalEntry[]>("list_journal_entries");
		return rows.map(fromRustJournalEntry);
	}

	async function listJournalTags(): Promise<JournalTag[]> {
		const rows = await invoke<RustJournalTag[]>("list_journal_tags");
		return rows.map(fromRustJournalTag);
	}

	async function backfillNoteLinks(notes: NoteFile[]): Promise<void> {
		const entries = notes.map((note) => ({
			noteId: note.id,
			links: buildRustNoteLinkRows(note),
			titleKeys: noteTitleKeys(note),
		}));
		if (entries.length > 0) {
			await invoke("replace_note_links_bulk", { entries });
		}
	}

	async function listPeople(): Promise<Person[]> {
		return invoke<Person[]>("list_people");
	}

	// Chip propagation runs in TS with the shared rewrite engine — the Rust side
	// stays a dumb store so BlockNote JSON semantics exist in exactly one place.
	// Each note re-reads inside its write-queue slot so an in-flight autosave
	// cannot be clobbered by a stale snapshot.
	async function rewriteNotes(
		buildPatch: (note: NoteFile) => NoteChipPatch | null,
	): Promise<string[]> {
		const notes = await listNotesWithBodies();

		const rewritten = await Promise.all(
			notes.map((candidate) => {
				if (!buildPatch(candidate)) return null;
				return runExclusive(`note:${candidate.id}`, async () => {
					const raw = await invoke<RustNote | null>("get_note", { id: candidate.id });
					if (!raw) return null;
					const fresh = fromRustNote(raw);
					const patch = buildPatch(fresh);
					if (!patch) return null;
					const next: NoteFile = { ...fresh, ...patch, modifiedAt: new Date() };
					await invoke("save_note", {
						note: toRustNote(next),
						links: buildRustNoteLinkRows(next),
						titleKeys: noteTitleKeys(next),
						reason: "autosave",
						createCheckpoint: false,
						sessionVersionId: null,
					});
					return candidate.id;
				});
			}),
		);

		return rewritten.filter((id): id is string => id !== null);
	}

	// Journal counterpart of rewriteNotes: applies a tag/person chip rewrite to
	// each journal entry and re-persists it so desktop tag/person rename+delete
	// propagate into journals like they do into notes.
	async function rewriteJournals(
		buildPatch: (entry: {
			content: string;
			richContent: NoteFile["richContent"];
			tags: string[];
			properties: [];
		}) => NoteChipPatch | null,
	): Promise<string[]> {
		const entries = await listJournalEntries();
		const rewritten: string[] = [];
		const results = await Promise.all(
			entries.map(async (entry) => {
				const patch = buildPatch({
					content: entry.content,
					richContent: entry.richContent ?? [],
					tags: entry.tags,
					properties: [],
				});
				if (!patch) return null;
				const next: JournalEntry = {
					...entry,
					content: patch.content ?? entry.content,
					richContent: (patch.richContent ??
						entry.richContent) as JournalEntry["richContent"],
					tags: patch.tags ?? entry.tags,
					updatedAt: new Date(),
				};
				await invoke("upsert_journal_entry", { entry: toRustJournalEntry(next) });
				return entry.id;
			}),
		);
		rewritten.push(...results.filter((id): id is string => id !== null));
		return rewritten;
	}

	return {
		mode: "tauri",
		capabilities: {
			journal: true,
			tasks: true,
			sharing: false,
			collaboration: false,
			notifications: false,
			ai: true,
			trash: true,
			history: true,
			coverUpload: true,
		},

		listNotes,
		listFolders,

		async uploadCoverImage(file) {
			const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
			const relative = await invoke<string>("save_cover_image", {
				fileName: file.name,
				bytes,
			});
			return `vault-asset:${relative}`;
		},

		async listCoverImages() {
			const rows = await invoke<RustCoverImage[]>("list_cover_images");
			return rows.map((row) => `vault-asset:${row.fileName}`);
		},

		async listCoverImagesDetailed() {
			const rows = await invoke<RustCoverImage[]>("list_cover_images");
			return rows.map(
				(row): CoverImage => ({
					url: `vault-asset:${row.fileName}`,
					pathname: row.fileName,
					size: row.size,
					uploadedAt: row.modifiedMs || undefined,
				}),
			);
		},

		async deleteCoverImage(image) {
			await invoke("delete_cover_image", { relative: image.pathname });
		},

		async getNote(id) {
			const raw = await invoke<RustNote | null>("get_note", { id });
			return raw ? fromRustNote(raw) : null;
		},

		async getNotes(ids) {
			const rows = await invoke<RustNote[]>("get_notes", { ids });
			return rows.map(fromRustNote);
		},

		async getNoteVersions(id) {
			const rows = await invoke<RustNoteVersion[]>("get_note_versions", {
				noteId: id,
				limit: 200,
			});
			return rows.map(fromRustNoteVersion);
		},

		async getNoteBacklinks(id) {
			const rawActive = await invoke<RustNote | null>("get_note", { id });
			if (!rawActive) return [];
			const active = fromRustNote(rawActive);

			const indexed = await invoke<boolean>("has_indexed_links");
			if (!indexed) {
				const notes = await listNotesWithBodies();
				await backfillNoteLinks(notes);
				return buildNoteBacklinks(active, notes);
			}

			const { sources } = await invoke<RustBacklinkSources>("get_backlink_sources", {
				targetId: id,
				titleKeys: noteTitleKeys(active),
			});
			const seen = new Set<string>();
			const backlinks: ResolvedNoteLink[] = [];
			for (const source of sources) {
				if (seen.has(source.note.id)) continue;
				seen.add(source.note.id);
				backlinks.push(backlinkFromSource(source, id));
			}
			return backlinks;
		},

		// Metadata + persisted link rows + people — the same inputs the web
		// backend feeds `buildGraphData`, instead of shipping every note body
		// over IPC and re-extracting links in TS.
		async getNoteGraph() {
			const [notes, links, people, journals] = await Promise.all([
				listNotes(),
				invoke<RustGraphLinkRow[]>("list_note_link_rows"),
				listPeople(),
				listJournalEntries(),
			]);
			// Journal link edges are derived in TS (there is no journal_links table in
			// SQLite); the same extractor the web index uses keeps parity.
			const personIdsByName = buildPersonNameResolutionMap(people);
			const journalLinks: JournalLinkRow[] = journals.flatMap((entry) =>
				buildDesiredJournalLinkRows(
					"local",
					{
						id: entry.id,
						content: entry.content,
						richContent: entry.richContent ?? [],
						tags: entry.tags,
					},
					personIdsByName,
				).map((row) => ({
					sourceJournalId: row.sourceJournalId,
					targetNoteId: row.targetNoteId ?? null,
					targetLabel: row.targetLabel,
					kind: row.kind,
				})),
			);
			return buildGraphData(notes, links, {
				people,
				journals: journals.map((entry) => ({
					id: entry.id,
					title: entry.title ?? null,
					dateKey: entry.dateKey,
					createdAt: entry.createdAt,
				})),
				journalLinks,
			});
		},

		async searchNotes(query, limit): Promise<NoteSearchHit[]> {
			const { text, tags, people } = parseSearchQuery(query);
			if (!text && tags.length === 0 && people.length === 0) return [];
			return invoke<NoteSearchHit[]>("search_notes", { query: text, tags, people, limit });
		},

		async restoreNoteVersion(versionId): Promise<UpdateNoteResult> {
			const result = await invoke<RustRestoreVersionResult>("restore_note_version", {
				versionId,
			});
			return {
				note: result.note ? fromRustNote(result.note) : undefined,
				versionCreated: result.versionCreated,
			};
		},

		async createNote(input) {
			const note = noteFromCreateInput(input);
			await invoke("save_note", {
				note: toRustNote(note),
				links: buildRustNoteLinkRows(note),
				titleKeys: noteTitleKeys(note),
				reason: "created",
				createCheckpoint: false,
				sessionVersionId: null,
			});
			return note;
		},

		async importNotes(notes) {
			await invoke("bulk_upsert_notes", { notes: notes.map(toRustNote) });
			const entries = notes.map((note) => ({
				noteId: note.id,
				links: buildRustNoteLinkRows(note),
				titleKeys: noteTitleKeys(note),
			}));
			if (entries.length > 0) {
				await invoke("replace_note_links_bulk", { entries });
			}
		},

		async updateNote(input): Promise<UpdateNoteResult> {
			return runExclusive(`note:${input.id}`, async () => {
				const raw = await invoke<RustNote | null>("get_note", { id: input.id });
				if (!raw) return { note: undefined, versionCreated: false };
				const next = applyNoteUpdate(fromRustNote(raw), input);

				const createCheckpoint = input.createCheckpoint === true;
				const reason: NoteVersionReason =
					input.name !== undefined
						? "rename"
						: createCheckpoint
							? "checkpoint"
							: "autosave";
				// One command for vault write + index upsert + link index +
				// version bookkeeping; the snapshot is derived Rust-side so the
				// note body crosses IPC once per save instead of three times.
				const versionResult = await invoke<RustVersionWriteResult>("save_note", {
					note: toRustNote(next),
					links: buildRustNoteLinkRows(next),
					titleKeys: noteTitleKeys(next),
					reason,
					createCheckpoint,
					sessionVersionId: createCheckpoint ? (input.sessionVersionId ?? null) : null,
				});

				return {
					note: next,
					versionCreated: versionResult.versionId !== null,
					versionChanged: versionResult.versionChanged,
					versionId: versionResult.versionId,
				};
			});
		},

		async deleteNote(id) {
			await invoke("delete_note", { id });
		},

		async deleteNotes(ids) {
			await Promise.all(ids.map((id) => invoke("delete_note", { id })));
		},

		async createFolder(input) {
			const folder = folderFromCreateInput(input);
			await invoke("upsert_folder", { folder: toRustFolder(folder) });
			return folder;
		},

		async updateFolder(input) {
			return runExclusive(`folder:${input.id}`, async () => {
				const folders = await listFolders();
				const existing = folders.find((folder) => folder.id === input.id);
				if (!existing) return undefined;
				const next = applyFolderUpdate(existing, input);
				await invoke("upsert_folder", { folder: toRustFolder(next) });
				return next;
			});
		},

		async deleteFolder(id) {
			await invoke("delete_folder", { id });
		},

		async listTrash() {
			const records = await invoke<RustTrashRecord[]>("list_trash");
			return trashRecordsToBatches(records);
		},

		async restoreTrash(batchId) {
			await invoke("restore_trash", { batchId });
		},

		async purgeTrash(batchId) {
			await invoke("purge_trash", { batchId });
		},

		async emptyTrash() {
			await invoke("empty_trash");
		},

		listJournalEntries,
		listJournalTags,

		async createJournalEntry(input) {
			const id = input.id ?? crypto.randomUUID();
			const existing = (await listJournalEntries()).find((entry) => entry.id === id);
			const now = new Date();
			const entry: JournalEntry = {
				id,
				dateKey: input.dateKey,
				title: input.title ?? undefined,
				content: input.content,
				tags: input.tags ?? [],
				mood: input.mood ?? undefined,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now,
			};
			await invoke("upsert_journal_entry", { entry: toRustJournalEntry(entry) });
			return entry;
		},

		async updateJournalEntry(input) {
			const existing = (await listJournalEntries()).find((entry) => entry.id === input.id);
			if (!existing) return undefined;
			const next: JournalEntry = {
				...existing,
				title: input.title === undefined ? existing.title : (input.title ?? undefined),
				content: input.content ?? existing.content,
				tags: input.tags ?? existing.tags,
				mood: input.mood === undefined ? existing.mood : (input.mood ?? undefined),
				updatedAt: new Date(),
			};
			await invoke("upsert_journal_entry", { entry: toRustJournalEntry(next) });
			return next;
		},

		async deleteJournalEntry(id) {
			await invoke("delete_journal_entry", { id });
		},

		async listTasks() {
			return (await invoke<RustTask[]>("list_tasks")).map(fromRustTask);
		},

		async createTask(input) {
			const now = new Date();
			const task: Task = {
				id: crypto.randomUUID(),
				title: input.title.trim(),
				status: input.status ?? "todo",
				priority: input.priority ?? "medium",
				dueDate: input.dueDate ?? undefined,
				tags: input.tags ?? [],
				assigneeIds: input.assigneeIds ?? [],
				description: input.description ?? "",
				sourceNoteId: input.sourceNoteId,
				sourceBlockId: input.sourceBlockId,
				createdAt: now,
				updatedAt: now,
			};
			return fromRustTask(await invoke<RustTask>("upsert_task", { task: toRustTask(task) }));
		},

		async updateTask(input) {
			const existing = (await invoke<RustTask[]>("list_tasks"))
				.map(fromRustTask)
				.find((task) => task.id === input.id);
			if (!existing) return undefined;
			const { id: _id, ...patch } = input;
			const next: Task = {
				...existing,
				...patch,
				title: patch.title?.trim() ?? existing.title,
				dueDate:
					patch.dueDate === undefined ? existing.dueDate : (patch.dueDate ?? undefined),
				updatedAt: new Date(),
			};
			return fromRustTask(await invoke<RustTask>("upsert_task", { task: toRustTask(next) }));
		},

		async deleteTask(id) {
			await invoke("delete_task", { id });
		},

		async createJournalTag(input) {
			const tag: JournalTag = {
				id: crypto.randomUUID(),
				name: input.name,
				color: input.color,
				usageCount: 0,
			};
			await invoke("upsert_journal_tag", { tag });
			return tag;
		},

		// Mirrors the server cascade: strip the tag name from every entry that
		// carries it, then remove the tag itself. Each entry rewrite re-persists
		// through the vault + index, same as a normal edit.
		async deleteJournalTag(id) {
			const target = (await listJournalTags()).find((tag) => tag.id === id);
			if (!target) return;
			const entries = await listJournalEntries();
			await Promise.all(
				entries.flatMap((entry) => {
					if (entry.tags.includes(target.name)) {
						const next: JournalEntry = {
							...entry,
							tags: entry.tags.filter((tag) => tag !== target.name),
							updatedAt: new Date(),
						};
						return [
							invoke("upsert_journal_entry", { entry: toRustJournalEntry(next) }),
						];
					}
					return [];
				}),
			);
			await invoke("delete_journal_tag", { id });
		},

		listPeople,

		async createPerson(input) {
			return invoke<Person>("create_person", {
				id: input.id ?? crypto.randomUUID(),
				name: input.name,
				color: input.color ?? null,
			});
		},

		async updatePerson(input) {
			return invoke<Person>("update_person", {
				id: input.id,
				name: input.name ?? null,
				color: input.color ?? null,
				clearColor: input.color === null,
			});
		},

		async deletePerson(id) {
			const people = await listPeople();
			const person = people.find((entry) => entry.id === id);
			if (!person) return { rewrittenNoteIds: [] };
			const rewrittenNoteIds = await rewriteNotes((note) =>
				rewriteNoteForPerson(note, { fromId: id, toId: null, removalText: person.name }),
			);
			await rewriteJournals((entry) =>
				rewriteNoteForPerson(entry, { fromId: id, toId: null, removalText: person.name }),
			);
			await invoke("delete_person", { id });
			return { rewrittenNoteIds };
		},

		async mergePersons(sourceId, targetId) {
			if (sourceId === targetId) return { rewrittenNoteIds: [] };
			const people = await listPeople();
			const source = people.find((entry) => entry.id === sourceId);
			const target = people.find((entry) => entry.id === targetId);
			if (!source || !target) return { rewrittenNoteIds: [] };
			const rewrittenNoteIds = await rewriteNotes((note) =>
				rewriteNoteForPerson(note, {
					fromId: sourceId,
					toId: targetId,
					toName: target.name,
				}),
			);
			await rewriteJournals((entry) =>
				rewriteNoteForPerson(entry, {
					fromId: sourceId,
					toId: targetId,
					toName: target.name,
				}),
			);
			await invoke("delete_person", { id: sourceId });
			return { rewrittenNoteIds };
		},

		async listPersonNotes(personId) {
			const [rows, journals, people] = await Promise.all([
				invoke<RustTaggedNoteSummary[]>("list_person_notes", { personId }),
				listJournalEntries(),
				listPeople(),
			]);
			const personIdsByName = buildPersonNameResolutionMap(people);
			const journalItems = journals.flatMap((entry) => {
				const personIds = new Set(
					buildDesiredJournalLinkRows(
						"local",
						{
							id: entry.id,
							content: entry.content,
							richContent: entry.richContent ?? [],
							tags: entry.tags,
						},
						personIdsByName,
					)
						.filter((row) => row.kind === "person")
						.map((row) => row.targetLabel),
				);
				return personIds.has(personId) ? [journalToTaggedSummary(entry)] : [];
			});
			return [...rows.map(fromRustTaggedNoteSummary), ...journalItems].sort(
				(left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime(),
			);
		},

		async listTags() {
			const [rows, journals] = await Promise.all([
				invoke<Array<{ name: string; color: string | null; noteCount: number }>>(
					"list_tag_summaries",
				),
				listJournalEntries(),
			]);
			const summaries = new Map<string, { color: NotePropertyColor | null; count: number }>();
			for (const row of rows) {
				summaries.set(row.name, {
					color: (row.color as NotePropertyColor | null) ?? null,
					count: row.noteCount,
				});
			}
			for (const entry of journals) {
				for (const tag of entry.tags) {
					const existing = summaries.get(tag);
					if (existing) existing.count += 1;
					else summaries.set(tag, { color: null, count: 1 });
				}
			}
			return [...summaries.entries()]
				.map(([name, value]) => ({ name, color: value.color, noteCount: value.count }))
				.sort((left, right) =>
					right.noteCount !== left.noteCount
						? right.noteCount - left.noteCount
						: left.name.localeCompare(right.name),
				);
		},

		async setTagColor(name, color) {
			const normalized = normalizeStoredTagEntry(name);
			if (!normalized) return;
			if (color === null) {
				await invoke("delete_note_tag_meta", { name: normalized });
				return;
			}
			await invoke("upsert_note_tag_meta", { name: normalized, color });
		},

		async renameTag(from, to) {
			const source = normalizeStoredTagEntry(from);
			const target = normalizeTagName(to);
			if (!source || !target || source === target) return { rewrittenNoteIds: [] };
			const rewrittenNoteIds = await rewriteNotes((note) =>
				rewriteNoteForTag(note, source, target),
			);
			await rewriteJournals((entry) => rewriteNoteForTag(entry, source, target));
			await invoke("rename_note_tag_meta", { from: source, to: target });
			return { rewrittenNoteIds };
		},

		async deleteTag(name) {
			const normalized = normalizeStoredTagEntry(name);
			if (!normalized) return { rewrittenNoteIds: [] };
			const rewrittenNoteIds = await rewriteNotes((note) =>
				rewriteNoteForTag(note, normalized, null),
			);
			await rewriteJournals((entry) => rewriteNoteForTag(entry, normalized, null));
			await invoke("delete_note_tag_meta", { name: normalized });
			return { rewrittenNoteIds };
		},

		async listTagNotes(name) {
			const normalized = normalizeStoredTagEntry(name);
			if (!normalized) return [];
			const [rows, journals] = await Promise.all([
				invoke<RustTaggedNoteSummary[]>("list_tag_notes", { name: normalized }),
				listJournalEntries(),
			]);
			const journalItems = journals.flatMap((entry) =>
				entry.tags.includes(normalized) ? [journalToTaggedSummary(entry)] : [],
			);
			return [...rows.map(fromRustTaggedNoteSummary), ...journalItems].sort(
				(left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime(),
			);
		},

		async importArchive(payload) {
			const folders = payload.folders.map((folder) =>
				toRustFolder({ ...folder, isOpen: true }),
			);
			const notes = payload.notes.map((input) => toRustNote(noteFromCreateInput(input)));
			const now = new Date();
			const journalEntries = payload.journalEntries.map((input) =>
				toRustJournalEntry({
					id: input.id ?? crypto.randomUUID(),
					dateKey: input.dateKey,
					title: input.title ?? undefined,
					content: input.content,
					tags: input.tags ?? [],
					mood: input.mood ?? undefined,
					createdAt: now,
					updatedAt: now,
				}),
			);

			// Tags are matched by name everywhere else in import/pull (no
			// per-tag upsert key), so skip any name that already exists locally
			// instead of risking a duplicate row under a fresh id.
			const existingTagNames = new Set((await listJournalTags()).map((tag) => tag.name));
			const journalTags = payload.journalTags.flatMap((tag) =>
				existingTagNames.has(tag.name)
					? []
					: [
							{
								id: crypto.randomUUID(),
								name: tag.name,
								color: tag.color,
								usageCount: 0,
							},
						],
			);

			const tagIdByName = new Map(
				(await listJournalTags()).map((tag) => [tag.name, tag.id] as const),
			);
			const deletedJournalTagIds = payload.deletedIds.journalTagNames
				.map((name) => tagIdByName.get(name))
				.filter((id): id is string => Boolean(id));

			await invoke("import_workspace_archive", {
				folders,
				notes,
				journalEntries,
				journalTags,
				deletedNoteIds: payload.deletedIds.notes,
				deletedFolderIds: payload.deletedIds.folders,
				deletedJournalEntryIds: payload.deletedIds.journalEntries,
				deletedJournalTagIds,
			});
		},
	};
}
