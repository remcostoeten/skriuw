import { eq } from "drizzle-orm";
import type { Block } from "@blocknote/core";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

import type { Item, Folder, Note } from "@/features/notes/types";

import * as schema from "./base-entities";
import {
        folders,
        notes,
        revisions,
        type FolderRow,
        type NoteRow
} from "./base-entities";

export const NOTE_STORAGE_KEY = "Skriuw_notes";
export const APP_SETTINGS_KEY = "app:settings";

export type NoteDatabase =
        | LibSQLDatabase<typeof schema>
        | SqliteRemoteDatabase<typeof schema>;

function now(): number {
        return Date.now();
}

function toJsonString(content: Block[] | undefined): string {
        try {
                return JSON.stringify(content ?? []);
        } catch {
                return "[]";
        }
}

function parseContent(serialized: string | null): Block[] {
        if (!serialized) return [];
        try {
                return JSON.parse(serialized) as Block[];
        } catch {
                return [];
        }
}

function createId(prefix: string): string {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
                return `${prefix}_${crypto.randomUUID()}`;
        }
        return `${prefix}_${Math.random().toString(36).slice(2)}`;
}

function mapFolder(row: FolderRow): Folder & { parentFolderId?: string } {
        return {
                id: row.id,
                name: row.name,
                type: "folder",
                children: [],
                parentFolderId: row.parentFolderId ?? undefined,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt
        };
}

function mapNote(row: NoteRow): Note {
        return {
                id: row.id,
                name: row.name,
                type: "note",
                content: parseContent(row.content),
                parentFolderId: row.folderId ?? undefined,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt
        };
}

function flattenItems(items: Item[]): Item[] {
        const results: Item[] = [];
        for (const item of items) {
                results.push(item);
                if (item.type === "folder" && item.children?.length) {
                        results.push(...flattenItems(item.children));
                }
        }
        return results;
}

export async function getItemByIdDb(
        db: NoteDatabase,
        id: string
): Promise<Item | undefined> {
        const noteRow = await db.query.notes.findFirst({ where: eq(notes.id, id) });
        if (noteRow) return mapNote(noteRow);

        const folderRow = await db.query.folders.findFirst({ where: eq(folders.id, id) });
        if (folderRow) return mapFolder(folderRow);

        return undefined;
}

export async function getNoteTreeDb(db: NoteDatabase): Promise<Item[]> {
        const [folderRows, noteRows] = await Promise.all([
                db.select().from(folders),
                db.select().from(notes)
        ]);

        const folderMap = new Map<string, Folder & { parentFolderId?: string }>();
        folderRows.forEach(row => folderMap.set(row.id, mapFolder(row)));

        const rootItems: Item[] = [];

        folderMap.forEach(folder => {
                if (folder.parentFolderId && folderMap.has(folder.parentFolderId)) {
                        const parent = folderMap.get(folder.parentFolderId)!;
                        parent.children.push(folder);
                } else {
                        rootItems.push(folder);
                }
        });

        noteRows.forEach(row => {
                const note = mapNote(row);
                if (note.parentFolderId && folderMap.has(note.parentFolderId)) {
                        folderMap.get(note.parentFolderId)!.children.push(note);
                } else {
                        rootItems.push(note);
                }
        });

        return rootItems;
}

export async function createFolderRecordDb(
        db: NoteDatabase,
        data: {
                name: string;
                parentFolderId?: string;
        }
): Promise<Folder> {
        const timestamp = now();
        const id = createId("fldr");

        await db.insert(folders).values({
                id,
                name: data.name,
                parentFolderId: data.parentFolderId ?? null,
                createdAt: timestamp,
                updatedAt: timestamp
        });

        return mapFolder({
                id,
                name: data.name,
                parentFolderId: data.parentFolderId ?? null,
                createdAt: timestamp,
                updatedAt: timestamp
        });
}

export async function createNoteRecordDb(
        db: NoteDatabase,
        data: {
                name: string;
                content?: Block[];
                parentFolderId?: string;
        }
): Promise<Note> {
        const timestamp = now();
        const id = createId("note");
        const serializedContent = toJsonString(data.content);

        await db.insert(notes).values({
                id,
                name: data.name,
                content: serializedContent,
                folderId: data.parentFolderId,
                createdAt: timestamp,
                updatedAt: timestamp
        });

        return mapNote({
                id,
                name: data.name,
                content: serializedContent,
                folderId: data.parentFolderId ?? null,
                createdAt: timestamp,
                updatedAt: timestamp,
                profileId: null
        });
}

export async function updateNoteRecordDb(
        db: NoteDatabase,
        id: string,
        data: Partial<{ name: string; content: Block[]; parentFolderId: string | null }>
): Promise<Note | undefined> {
        const existing = await db.query.notes.findFirst({ where: eq(notes.id, id) });
        if (!existing) return undefined;

        if (data.content) {
                        await db.insert(revisions).values({
                                id: createId("rev"),
                                noteId: id,
                                label: "auto",
                                snapshot: existing.content,
                                createdAt: now()
                        });
        }

        const serializedContent = data.content ? toJsonString(data.content) : existing.content;
        const updatedAt = now();

        await db
                .update(notes)
                .set({
                        name: data.name ?? existing.name,
                        content: serializedContent,
                        folderId: data.parentFolderId ?? existing.folderId,
                        updatedAt
                })
                .where(eq(notes.id, id));

        return mapNote({
                ...existing,
                name: data.name ?? existing.name,
                content: serializedContent,
                folderId: data.parentFolderId ?? existing.folderId,
                updatedAt
        });
}

export async function renameItemRecordDb(
        db: NoteDatabase,
        id: string,
        newName: string
): Promise<Item | undefined> {
        const noteRow = await db.query.notes.findFirst({ where: eq(notes.id, id) });
        if (noteRow) {
                const updatedAt = now();
                await db.update(notes).set({ name: newName, updatedAt }).where(eq(notes.id, id));
                return mapNote({ ...noteRow, name: newName, updatedAt });
        }

        const folderRow = await db.query.folders.findFirst({ where: eq(folders.id, id) });
        if (folderRow) {
                const updatedAt = now();
                await db.update(folders).set({ name: newName, updatedAt }).where(eq(folders.id, id));
                return mapFolder({ ...folderRow, name: newName, updatedAt });
        }

        return undefined;
}

export async function moveItemRecordDb(
        db: NoteDatabase,
        id: string,
        targetFolderId: string | null
): Promise<boolean> {
        const noteRow = await db.query.notes.findFirst({ where: eq(notes.id, id) });
        if (noteRow) {
                await db
                        .update(notes)
                        .set({ folderId: targetFolderId, updatedAt: now() })
                        .where(eq(notes.id, id));
                return true;
        }

        const folderRow = await db.query.folders.findFirst({ where: eq(folders.id, id) });
        if (folderRow) {
                await db
                        .update(folders)
                        .set({ parentFolderId: targetFolderId, updatedAt: now() })
                        .where(eq(folders.id, id));
                return true;
        }

        return false;
}

export async function deleteItemRecordDb(db: NoteDatabase, id: string): Promise<boolean> {
        const noteResult = await db.delete(notes).where(eq(notes.id, id));
        if ("rowsAffected" in noteResult && (noteResult as any).rowsAffected > 0) {
                return true;
        }

        const folderResult = await db.delete(folders).where(eq(folders.id, id));
        if ("rowsAffected" in folderResult && (folderResult as any).rowsAffected > 0) {
                return true;
        }

        return false;
}

export async function readNoteEntitiesDb(
        db: NoteDatabase,
        options?: {
                getById?: string;
                filter?: (item: Item) => boolean;
                sort?: (a: Item, b: Item) => number;
        }
): Promise<Item[] | Item | undefined> {
        if (options?.getById) {
                return getItemByIdDb(db, options.getById);
        }

        const items = await getNoteTreeDb(db);
        if (options?.filter || options?.sort) {
                const flatItems = flattenItems(items);
                const filtered = options.filter ? flatItems.filter(options.filter) : flatItems;

                if (options.sort) {
                        filtered.sort(options.sort);
                }

                return filtered;
        }

        return items;
}

export async function getNotesByFolderDb(
        db: NoteDatabase,
        parentFolderId?: string
): Promise<Note[]> {
        const noteRows = parentFolderId
                ? await db.query.notes.findMany({ where: eq(notes.folderId, parentFolderId) })
                : await db.query.notes.findMany();
        return noteRows.map(mapNote);
}

export async function getNoteByIdDb(db: NoteDatabase, id: string): Promise<Note | undefined> {
        const noteRow = await db.query.notes.findFirst({ where: eq(notes.id, id) });
        return noteRow ? mapNote(noteRow) : undefined;
}
