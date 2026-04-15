import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildStarterWorkspace } from "@/src/core/starter-data";
import type {
  MobileFolder,
  MobileJournalEntry,
  MobileNote,
  MobileWorkspace,
  MoodLevel,
} from "@/src/core/workspace-types";
import { createId, toDateKey } from "@/src/lib/workspace-format";

const STORAGE_KEY = "skriuw:mobile:guest-workspace:v1";

type WorkspaceContextValue = {
  isHydrated: boolean;
  workspace: MobileWorkspace;
  cloudConfigured: boolean;
  createFolder: (parentId?: string | null) => Promise<MobileFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  createNote: (parentId?: string | null) => Promise<MobileNote>;
  updateNote: (id: string, patch: Partial<Pick<MobileNote, "name" | "content" | "parentId">>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  createJournalEntry: () => Promise<MobileJournalEntry>;
  updateJournalEntry: (
    id: string,
    patch: Partial<Pick<MobileJournalEntry, "content" | "dateKey" | "tags" | "mood">>,
  ) => Promise<void>;
  deleteJournalEntry: (id: string) => Promise<void>;
  resetWorkspace: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const EMPTY_WORKSPACE = buildStarterWorkspace();

function isCloudConfigured() {
  return Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<MobileWorkspace>(EMPTY_WORKSPACE);
  const [isHydrated, setIsHydrated] = useState(false);
  const workspaceRef = useRef(workspace);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled) {
          setWorkspace(raw ? (JSON.parse(raw) as MobileWorkspace) : buildStarterWorkspace());
        }
      } catch {
        if (!cancelled) {
          setWorkspace(buildStarterWorkspace());
        }
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveWorkspace(next: MobileWorkspace) {
    setWorkspace(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function createFolder(parentId: string | null = null) {
    const now = new Date().toISOString();
    const folderNumber = workspaceRef.current.folders.length + 1;
    const folder: MobileFolder = {
      id: createId("folder"),
      name: `Folder ${folderNumber}`,
      parentId,
      createdAt: now,
      updatedAt: now,
    };

    await saveWorkspace({
      ...workspaceRef.current,
      folders: [folder, ...workspaceRef.current.folders],
    });

    return folder;
  }

  async function renameFolder(id: string, name: string) {
    const now = new Date().toISOString();
    await saveWorkspace({
      ...workspaceRef.current,
      folders: workspaceRef.current.folders.map((folder) =>
        folder.id === id ? { ...folder, name: name || "Untitled folder", updatedAt: now } : folder,
      ),
    });
  }

  async function deleteFolder(id: string) {
    await saveWorkspace({
      ...workspaceRef.current,
      folders: workspaceRef.current.folders.filter((folder) => folder.id !== id),
      notes: workspaceRef.current.notes.map((note) =>
        note.parentId === id ? { ...note, parentId: null } : note,
      ),
    });
  }

  async function createNote(parentId: string | null = null) {
    const now = new Date().toISOString();
    const note: MobileNote = {
      id: createId("note"),
      name: "Untitled note",
      content: "",
      parentId,
      createdAt: now,
      updatedAt: now,
    };
    await saveWorkspace({
      ...workspaceRef.current,
      notes: [note, ...workspaceRef.current.notes],
    });
    return note;
  }

  async function updateNote(id: string, patch: Partial<Pick<MobileNote, "name" | "content" | "parentId">>) {
    const now = new Date().toISOString();
    await saveWorkspace({
      ...workspaceRef.current,
      notes: workspaceRef.current.notes.map((note) =>
        note.id === id ? { ...note, ...patch, updatedAt: now } : note,
      ),
    });
  }

  async function deleteNote(id: string) {
    await saveWorkspace({
      ...workspaceRef.current,
      notes: workspaceRef.current.notes.filter((note) => note.id !== id),
    });
  }

  async function createJournalEntry() {
    const now = new Date().toISOString();
    const entry: MobileJournalEntry = {
      id: createId("entry"),
      dateKey: toDateKey(),
      content: "",
      tags: [],
      mood: "neutral",
      createdAt: now,
      updatedAt: now,
    };
    await saveWorkspace({
      ...workspaceRef.current,
      journalEntries: [entry, ...workspaceRef.current.journalEntries],
    });
    return entry;
  }

  async function updateJournalEntry(
    id: string,
    patch: Partial<Pick<MobileJournalEntry, "content" | "dateKey" | "tags" | "mood">>,
  ) {
    const now = new Date().toISOString();
    await saveWorkspace({
      ...workspaceRef.current,
      journalEntries: workspaceRef.current.journalEntries.map((entry) =>
        entry.id === id ? { ...entry, ...patch, updatedAt: now } : entry,
      ),
    });
  }

  async function deleteJournalEntry(id: string) {
    await saveWorkspace({
      ...workspaceRef.current,
      journalEntries: workspaceRef.current.journalEntries.filter((entry) => entry.id !== id),
    });
  }

  async function resetWorkspace() {
    await saveWorkspace(buildStarterWorkspace());
  }

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      isHydrated,
      workspace,
      cloudConfigured: isCloudConfigured(),
      createFolder,
      renameFolder,
      deleteFolder,
      createNote,
      updateNote,
      deleteNote,
      createJournalEntry,
      updateJournalEntry,
      deleteJournalEntry,
      resetWorkspace,
    }),
    [isHydrated, workspace],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }

  return context;
}

export function getMoodOptions(): MoodLevel[] {
  return ["great", "good", "neutral", "low", "rough"];
}
