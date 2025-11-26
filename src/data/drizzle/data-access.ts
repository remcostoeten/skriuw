

import { getDb } from "./client";
import {
        createFolderRecordDb,
        createNoteRecordDb,
        deleteItemRecordDb,
        getItemByIdDb,
        getNoteByIdDb,
        getNoteTreeDb,
        getNotesByFolderDb,
        moveItemRecordDb,
        readNoteEntitiesDb,
        renameItemRecordDb,
        updateNoteRecordDb
} from "./note-storage";

import type { Item, Note } from "@/features/notes/types";
import type { Block } from "@blocknote/core";

export { NOTE_STORAGE_KEY } from "./note-storage";

export async function getItemById(id: string) {
        return getItemByIdDb(getDb(), id);
}

export async function getNoteTree() {
        return getNoteTreeDb(getDb());
}

export async function createFolderRecord(data: { name: string; parentFolderId?: string }) {
        return createFolderRecordDb(getDb(), data);
}

export async function createNoteRecord(data: { name: string; content?: Block[]; parentFolderId?: string }) {
        return createNoteRecordDb(getDb(), data);
}

export async function updateNoteRecord(
        id: string,
        data: Partial<{ name: string; content: Block[]; parentFolderId: string | null }>
) {
        return updateNoteRecordDb(getDb(), id, data);
}

export async function renameItemRecord(id: string, newName: string) {
        return renameItemRecordDb(getDb(), id, newName);
}

export async function moveItemRecord(id: string, targetFolderId: string | null) {
        return moveItemRecordDb(getDb(), id, targetFolderId);
}

export async function deleteItemRecord(id: string) {
        return deleteItemRecordDb(getDb(), id);
}

export async function readNoteEntities(options?: {
        getById?: string;
        filter?: (item: Item) => boolean;
        sort?: (a: Item, b: Item) => number;
}) {
        return readNoteEntitiesDb(getDb(), options);
}

export async function getNotesByFolder(parentFolderId?: string): Promise<Note[]> {
        return getNotesByFolderDb(getDb(), parentFolderId);
}

export async function getNoteById(id: string): Promise<Note | undefined> {
        return getNoteByIdDb(getDb(), id);
}
