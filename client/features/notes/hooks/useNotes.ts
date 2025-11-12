import { useState, useCallback, useEffect } from "react";
import { Block } from "@blocknote/core";
import { getStorage, Note, Folder, Item } from "../services/noteStorage";

export function useNotes() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    getStorage().getItems().then(setItems);
  }, []);

  const getNote = useCallback(async (id: string): Promise<Note | undefined> => {
    return await getStorage().findNote(id);
  }, []);

  const getItem = useCallback(async (id: string): Promise<Item | undefined> => {
    return await getStorage().findItemById(id);
  }, []);

  const createNote = useCallback(async (name: string = "Untitled", parentFolderId?: string) => {
    const newNote = await getStorage().createNote({ name, parentFolderId });
    const updatedItems = await getStorage().getItems();
    setItems(updatedItems);
    return newNote;
  }, []);

  const createFolder = useCallback(async (name: string = "New Folder", parentFolderId?: string) => {
    const newFolder = await getStorage().createFolder({ name, parentFolderId });
    const updatedItems = await getStorage().getItems();
    setItems(updatedItems);
    return newFolder;
  }, []);

  const updateNote = useCallback(async (id: string, content: Block[], name?: string) => {
    await getStorage().updateNote(id, { content, name });
    const updatedItems = await getStorage().getItems();
    setItems(updatedItems);
  }, []);

  const renameItem = useCallback(async (id: string, newName: string) => {
    await getStorage().renameItem(id, newName);
    const updatedItems = await getStorage().getItems();
    setItems(updatedItems);
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    const success = await getStorage().deleteItem(id);
    if (success) {
      const updatedItems = await getStorage().getItems();
      setItems(updatedItems);
    }
    return success;
  }, []);

  const moveItem = useCallback(async (itemId: string, targetFolderId: string | null) => {
    const success = await getStorage().moveItem(itemId, targetFolderId);
    if (success) {
      const updatedItems = await getStorage().getItems();
      setItems(updatedItems);
    }
    return success;
  }, []);

  const countChildren = useCallback(async (folderId: string): Promise<number> => {
    return await getStorage().countChildren(folderId);
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
