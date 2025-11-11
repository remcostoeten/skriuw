import { useState, useCallback, useEffect } from "react";
import { Block } from "@blocknote/core";
import { NoteStorage, Note, Folder, Item } from "../services/noteStorage";

export function useNotes() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    NoteStorage.getItemsAsync().then(setItems);
  }, []);

  const getNote = useCallback(async (id: string): Promise<Note | undefined> => {
    return await NoteStorage.findNote(id);
  }, []);

  const getItem = useCallback(async (id: string): Promise<Item | undefined> => {
    return await NoteStorage.findItemById(id);
  }, []);

  const createNote = useCallback(async (name: string = "Untitled", parentFolderId?: string) => {
    const newNote = await NoteStorage.createNote({ name, parentFolderId });
    const updatedItems = await NoteStorage.getItemsAsync();
    setItems(updatedItems);
    return newNote;
  }, []);

  const createFolder = useCallback(async (name: string = "New Folder", parentFolderId?: string) => {
    const newFolder = await NoteStorage.createFolder({ name, parentFolderId });
    const updatedItems = await NoteStorage.getItemsAsync();
    setItems(updatedItems);
    return newFolder;
  }, []);

  const updateNote = useCallback(async (id: string, content: Block[], name?: string) => {
    await NoteStorage.updateNote(id, { content, name });
    const updatedItems = await NoteStorage.getItemsAsync();
    setItems(updatedItems);
  }, []);

  const renameItem = useCallback(async (id: string, newName: string) => {
    await NoteStorage.renameItem(id, newName);
    const updatedItems = await NoteStorage.getItemsAsync();
    setItems(updatedItems);
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    const success = await NoteStorage.deleteItem(id);
    if (success) {
      const updatedItems = await NoteStorage.getItemsAsync();
      setItems(updatedItems);
    }
    return success;
  }, []);

  const moveItem = useCallback(async (itemId: string, targetFolderId: string | null) => {
    const success = await NoteStorage.moveItem(itemId, targetFolderId);
    if (success) {
      const updatedItems = await NoteStorage.getItemsAsync();
      setItems(updatedItems);
    }
    return success;
  }, []);

  const countChildren = useCallback(async (folderId: string): Promise<number> => {
    return await NoteStorage.countChildren(folderId);
  }, []);

  return {
    items,
    getNote,
    getItem,
    createNote,
    createFolder,
    updateNote,
    renameItem,
    deleteItem,
    moveItem,
    countChildren,
  };
}
