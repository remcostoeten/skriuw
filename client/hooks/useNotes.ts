import { useState, useCallback, useEffect } from "react";
import { Block } from "@blocknote/core";
import { NoteStorage, Note, Folder, Item } from "@/services/noteStorage";

export function useNotes() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    setItems(NoteStorage.getItems());
  }, []);

  const getNote = useCallback((id: string): Note | undefined => {
    return NoteStorage.findNote(id);
  }, []);

  const getItem = useCallback((id: string): Item | undefined => {
    return NoteStorage.findItemById(id);
  }, []);

  const createNote = useCallback((name: string = "Untitled", parentFolderId?: string) => {
    const newNote = NoteStorage.createNote(name, parentFolderId);
    setItems(NoteStorage.getItems());
    return newNote;
  }, []);

  const createFolder = useCallback((name: string = "New Folder", parentFolderId?: string) => {
    const newFolder = NoteStorage.createFolder(name, parentFolderId);
    setItems(NoteStorage.getItems());
    return newFolder;
  }, []);

  const updateNote = useCallback((id: string, content: Block[], name?: string) => {
    NoteStorage.updateNote(id, content, name);
    setItems(NoteStorage.getItems());
  }, []);

  const renameItem = useCallback((id: string, newName: string) => {
    NoteStorage.renameItem(id, newName);
    setItems(NoteStorage.getItems());
  }, []);

  const deleteItem = useCallback((id: string) => {
    const success = NoteStorage.deleteItem(id);
    if (success) {
      setItems(NoteStorage.getItems());
    }
    return success;
  }, []);

  const moveItem = useCallback((itemId: string, targetFolderId: string | null) => {
    const success = NoteStorage.moveItem(itemId, targetFolderId);
    if (success) {
      setItems(NoteStorage.getItems());
    }
    return success;
  }, []);

  const countChildren = useCallback((folderId: string): number => {
    return NoteStorage.countChildren(folderId);
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
