import type { Block } from "@blocknote/core";

import type { Item, Note } from "@/features/notes/types";

import { getDb } from "./db";
import {
        NOTE_STORAGE_KEY,
        createFolderRecord as createFolderRecordDb,
        createNoteRecord as createNoteRecordDb,
        deleteItemRecord as deleteItemRecordDb,
        getItemById as getItemByIdDb,
        getNoteById as getNoteByIdDb,
        getNoteTree as getNoteTreeDb,
        getNotesByFolder as getNotesByFolderDb,
        moveItemRecord as moveItemRecordDb,
        readNoteEntities as readNoteEntitiesDb,
        renameItemRecord as renameItemRecordDb,
        updateNoteRecord as updateNoteRecordDb
} from "./note-storage";

export { NOTE_STORAGE_KEY } from "./note-storage";

export async function getItemById(id: string) {
        return getItemByIdDb(await getDb(), id);
}

export async function getNoteTree() {
        return getNoteTreeDb(await getDb());
}

export async function createFolderRecord(data: { name: string; parentFolderId?: string }) {
        return createFolderRecordDb(await getDb(), data);
}

export async function createNoteRecord(data: { name: string; content?: Block[]; parentFolderId?: string }) {
        return createNoteRecordDb(await getDb(), data);
}

export async function updateNoteRecord(
        id: string,
        data: Partial<{ name: string; content: Block[]; parentFolderId: string | null }>
) {
        return updateNoteRecordDb(await getDb(), id, data);
}

export async function renameItemRecord(id: string, newName: string) {
        return renameItemRecordDb(await getDb(), id, newName);
}

export async function moveItemRecord(id: string, targetFolderId: string | null) {
        return moveItemRecordDb(await getDb(), id, targetFolderId);
}

export async function deleteItemRecord(id: string) {
        return deleteItemRecordDb(await getDb(), id);
}

export async function readNoteEntities(options?: {
        getById?: string;
        filter?: (item: Item) => boolean;
        sort?: (a: Item, b: Item) => number;
}) {
        return readNoteEntitiesDb(await getDb(), options);
}

export async function getNotesByFolder(parentFolderId?: string): Promise<Note[]> {
        return getNotesByFolderDb(await getDb(), parentFolderId);
}

export async function getNoteById(id: string): Promise<Note | undefined> {
        return getNoteByIdDb(await getDb(), id);
}
