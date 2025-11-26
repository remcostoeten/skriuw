import { eq } from "drizzle-orm";



import { asUUID } from "@/shared/types/semantic";


import * as schema from "./base-entities";
import {
        folders,
        notes,
        revisions,
        type FolderRow,
        type NoteRow
} from "./base-entities";

import type { Item, Folder, Note } from "@/features/notes/types";
import type { UUID, Time } from "@/shared/types/semantic";
import type { Block } from "@blocknote/core";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

export const NOTE_STORAGE_KEY = "Skriuw_notes";
export const APP_SETTINGS_KEY = "app:settings";

export type NoteDatabase =
        | LibSQLDatabase<typeof schema>
        | SqliteRemoteDatabase<typeof schema>;

function now(): Time {
        return Date.now() as Time;
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

function createId(prefix: string): UUID {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
                return `${prefix}_${crypto.randomUUID()}` as UUID;
        }
        return `${prefix}_${Math.random().toString(36).slice(2)}` as UUID;
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
        const noteRow = await db.query.notes.findFirst({ where: eq(notes.id, asUUID(id)) });
        if (noteRow) return mapNote(noteRow);

        const folderRow = await db.query.folders.findFirst({ where: eq(folders.id, asUUID(id)) });
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
                folderId: data.parentFolderId ? asUUID(data.parentFolderId) : null,
                createdAt: timestamp,
                updatedAt: timestamp
        } as any);

        return mapNote({
                id: id as UUID,
                name: data.name,
                content: serializedContent,
                folderId: data.parentFolderId ? (asUUID(data.parentFolderId) as any) : null,
                createdAt: timestamp,
                updatedAt: timestamp,
                profileId: null
        } as NoteRow);
}

export async function updateNoteRecordDb(
        db: NoteDatabase,
        id: string,
        data: Partial<{ name: string; content: Block[]; parentFolderId: string | null }>
): Promise<Note | undefined> {
        const existing = await db.query.notes.findFirst({ where: eq(notes.id, asUUID(id)) });
        if (!existing) return undefined;

        if (data.content) {
                        await db.insert(revisions).values({
                                id: createId("rev"),
                                noteId: asUUID(id),
                                label: "auto",
                                snapshot: existing.content,
                                createdAt: now()
                        });
        }

        const serializedContent = data.content ? toJsonString(data.content) : existing.content;
        const updatedAt = now();

        const updateData: any = {
                name: data.name ?? existing.name,
                content: serializedContent,
                updatedAt
        };
        if (data.parentFolderId !== undefined) {
                updateData.folderId = data.parentFolderId ? asUUID(data.parentFolderId) : null;
        }

        await db
                .update(notes)
                .set(updateData as any)
                .where(eq(notes.id, asUUID(id)));

        return mapNote({
                ...existing,
                name: data.name ?? existing.name,
                content: serializedContent,
                folderId: (data.parentFolderId !== undefined 
                        ? (data.parentFolderId ? asUUID(data.parentFolderId) : null)
                        : existing.folderId) as any,
                updatedAt
        } as NoteRow);
}

export async function renameItemRecordDb(
        db: NoteDatabase,
        id: string,
        newName: string
): Promise<Item | undefined> {
        const noteRow = await db.query.notes.findFirst({ where: eq(notes.id, asUUID(id)) });
        if (noteRow) {
                const updatedAt = now();
                await db.update(notes).set({ name: newName, updatedAt }).where(eq(notes.id, asUUID(id)));
                return mapNote({ ...noteRow, name: newName, updatedAt });
        }

        const folderRow = await db.query.folders.findFirst({ where: eq(folders.id, asUUID(id)) });
        if (folderRow) {
                const updatedAt = now();
                await db.update(folders).set({ name: newName, updatedAt }).where(eq(folders.id, asUUID(id)));
                return mapFolder({ ...folderRow, name: newName, updatedAt });
        }

        return undefined;
}

export async function moveItemRecordDb(
        db: NoteDatabase,
        id: string,
        targetFolderId: string | null
): Promise<boolean> {
        const noteRow = await db.query.notes.findFirst({ where: eq(notes.id, asUUID(id)) });
        if (noteRow) {
                await db
                        .update(notes)
                        .set({ folderId: targetFolderId ? asUUID(targetFolderId) : null, updatedAt: now() } as any)
                        .where(eq(notes.id, asUUID(id)));
                return true;
        }

        const folderRow = await db.query.folders.findFirst({ where: eq(folders.id, asUUID(id)) });
        if (folderRow) {
                await db
                        .update(folders)
                        .set({ parentFolderId: targetFolderId ? asUUID(targetFolderId) : null, updatedAt: now() })
                        .where(eq(folders.id, asUUID(id)));
                return true;
        }

        return false;
}

export async function deleteItemRecordDb(db: NoteDatabase, id: string): Promise<boolean> {
        const noteResult = await db.delete(notes).where(eq(notes.id, asUUID(id)));
        if ("rowsAffected" in noteResult && (noteResult as any).rowsAffected > 0) {
                return true;
        }

        const folderResult = await db.delete(folders).where(eq(folders.id, asUUID(id)));
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
                ? await db.query.notes.findMany({ where: eq(notes.folderId, asUUID(parentFolderId)) })
                : await db.query.notes.findMany();
        return noteRows.map((row) => mapNote(row as NoteRow));
}

export async function getNoteByIdDb(db: NoteDatabase, id: string): Promise<Note | undefined> {
        const noteRow = await db.query.notes.findFirst({ where: eq(notes.id, asUUID(id)) });
        return noteRow ? mapNote(noteRow) : undefined;
}
