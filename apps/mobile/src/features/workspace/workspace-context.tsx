import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  MobileFolder,
  MobileJournalEntry,
  MobileNote,
  MobileWorkspace,
  MoodLevel,
} from "@/src/core/workspace-types";
import {
  createMobileCloudRepositories,
  type MobileCloudWorkspaceTarget,
  type MobilePersistenceRepositories,
} from "@/src/features/workspace/mobile-cloud-repositories";
import {
  mapFolderToMobileFolder,
  mapJournalEntryToMobileJournalEntry,
  mapNoteToMobileNote,
  mapWorkspaceToMobileWorkspace,
} from "@/src/features/workspace/mobile-workspace-mappers";
import { initializeAuth } from "@/src/platform/auth";
import { useAuthSnapshot } from "@/src/platform/auth/use-auth";
import { toDateKey } from "@/src/lib/workspace-format";
import type {
  DateKey,
  FolderId,
  JournalEntryId,
  MarkdownContent,
  NoteId,
  TagName,
  TagId,
} from "@/core/shared/persistence-types";

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

const EMPTY_WORKSPACE: MobileWorkspace = {
  folders: [],
  notes: [],
  journalEntries: [],
};

function asFolderId(id: string): FolderId {
  return id as FolderId;
}

function asNoteId(id: string): NoteId {
  return id as NoteId;
}

function asJournalEntryId(id: string): JournalEntryId {
  return id as JournalEntryId;
}

function asTagId(id: string): TagId {
  return id as TagId;
}

function getCloudWorkspaceTarget(
  userId: string | null | undefined,
): MobileCloudWorkspaceTarget | null {
  if (!userId) {
    return null;
  }

  return {
    kind: "cloud",
    workspaceId: userId,
    userId,
  };
}

function getFolderRoots(folders: MobileFolder[]): string[] {
  const folderIds = new Set(folders.map((folder) => folder.id));
  return folders
    .filter((folder) => folder.parentId === null || !folderIds.has(folder.parentId))
    .map((folder) => folder.id);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const auth = useAuthSnapshot();
  const [workspace, setWorkspace] = useState<MobileWorkspace>(EMPTY_WORKSPACE);
  const [isHydrated, setIsHydrated] = useState(false);
  const workspaceRef = useRef(workspace);
  const mutationQueuesRef = useRef(new Map<string, Promise<void>>());

  const target = getCloudWorkspaceTarget(auth.user?.id);
  const repositories = useMemo<MobilePersistenceRepositories | null>(
    () => (target ? createMobileCloudRepositories(target) : null),
    [target?.userId],
  );

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    if (!auth.isReady) {
      void initializeAuth();
    }
  }, [auth.isReady]);

  function applyWorkspace(next: MobileWorkspace | ((current: MobileWorkspace) => MobileWorkspace)) {
    setWorkspace((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      workspaceRef.current = resolved;
      return resolved;
    });
  }

  function requireRepositories(): MobilePersistenceRepositories {
    if (!repositories) {
      throw new Error("Mobile workspace requires an authenticated user.");
    }

    return repositories;
  }

  async function hydrateWorkspace(activeRepositories: MobilePersistenceRepositories) {
    const [folders, notes, journalEntries] = await Promise.all([
      activeRepositories.folders.list(),
      activeRepositories.notes.list(),
      activeRepositories.journal.listEntries(),
    ]);

    return mapWorkspaceToMobileWorkspace({
      folders,
      notes,
      journalEntries,
    });
  }

  function queueMutation(key: string, task: () => Promise<void>) {
    const previous = mutationQueuesRef.current.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    const tracked = next.finally(() => {
      if (mutationQueuesRef.current.get(key) === tracked) {
        mutationQueuesRef.current.delete(key);
      }
    });
    mutationQueuesRef.current.set(key, tracked);
    return tracked;
  }

  useEffect(() => {
    let cancelled = false;

    if (!auth.isReady) {
      setIsHydrated(false);
      return () => {
        cancelled = true;
      };
    }

    if (!repositories) {
      applyWorkspace(EMPTY_WORKSPACE);
      setIsHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    setIsHydrated(false);

    void (async () => {
      try {
        const nextWorkspace = await hydrateWorkspace(repositories);
        if (!cancelled) {
          applyWorkspace(nextWorkspace);
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
  }, [auth.isReady, repositories]);

  async function createFolder(parentId: string | null = null) {
    const activeRepositories = requireRepositories();
    const folderNumber = workspaceRef.current.folders.length + 1;
    const created = await activeRepositories.folders.create({
      name: `Folder ${folderNumber}`,
      parentId: parentId ? asFolderId(parentId) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const mobileFolder = mapFolderToMobileFolder(created);

    applyWorkspace((current) => ({
      ...current,
      folders: [mobileFolder, ...current.folders],
    }));

    return mobileFolder;
  }

  async function renameFolder(id: string, name: string) {
    const activeRepositories = requireRepositories();
    const nextName = name || "Untitled folder";

    applyWorkspace((current) => ({
      ...current,
      folders: current.folders.map((folder) =>
        folder.id === id ? { ...folder, name: nextName, updatedAt: new Date().toISOString() } : folder,
      ),
    }));

    await queueMutation(`folder:${id}`, async () => {
      const updated = await activeRepositories.folders.update({
        id: asFolderId(id),
        name: nextName,
        updatedAt: new Date(),
      });

      if (!updated) {
        return;
      }

      const mobileFolder = mapFolderToMobileFolder(updated);
      applyWorkspace((current) => ({
        ...current,
        folders: current.folders.map((folder) => (folder.id === id ? mobileFolder : folder)),
      }));
    });
  }

  async function deleteFolder(id: string) {
    const activeRepositories = requireRepositories();
    const workspaceSnapshot = workspaceRef.current;
    const notesToRehome = workspaceSnapshot.notes.filter((note) => note.parentId === id);

    applyWorkspace((current) => ({
      ...current,
      folders: current.folders.filter((folder) => folder.id !== id),
      notes: current.notes.map((note) => (note.parentId === id ? { ...note, parentId: null } : note)),
    }));

    await Promise.all(
      notesToRehome.map((note) =>
        queueMutation(`note:${note.id}`, async () => {
          const updated = await activeRepositories.notes.update({
            id: asNoteId(note.id),
            parentId: null,
            updatedAt: new Date(),
          });

          if (!updated) {
            return;
          }

          const mobileNote = mapNoteToMobileNote(updated);
          applyWorkspace((current) => ({
            ...current,
            notes: current.notes.map((item) => (item.id === note.id ? mobileNote : item)),
          }));
        }),
      ),
    );

    await queueMutation(`folder:${id}`, async () => {
      await activeRepositories.folders.destroy(asFolderId(id));
      const nextWorkspace = await hydrateWorkspace(activeRepositories);
      applyWorkspace(nextWorkspace);
    });
  }

  async function createNote(parentId: string | null = null) {
    const activeRepositories = requireRepositories();
    const now = new Date();
    const created = await activeRepositories.notes.create({
      name: "",
      content: "" as MarkdownContent,
      parentId: parentId ? asFolderId(parentId) : null,
      createdAt: now,
      updatedAt: now,
    });
    const mobileNote = mapNoteToMobileNote(created);

    applyWorkspace((current) => ({
      ...current,
      notes: [mobileNote, ...current.notes],
    }));

    return mobileNote;
  }

  async function updateNote(id: string, patch: Partial<Pick<MobileNote, "name" | "content" | "parentId">>) {
    const activeRepositories = requireRepositories();
    const optimisticUpdatedAt = new Date().toISOString();

    applyWorkspace((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === id ? { ...note, ...patch, updatedAt: optimisticUpdatedAt } : note,
      ),
    }));

    await queueMutation(`note:${id}`, async () => {
      const updated = await activeRepositories.notes.update({
        id: asNoteId(id),
        name: patch.name,
        content: patch.content as MarkdownContent | undefined,
        parentId: patch.parentId === undefined ? undefined : patch.parentId === null ? null : asFolderId(patch.parentId),
        updatedAt: new Date(),
      });

      if (!updated) {
        return;
      }

      const mobileNote = mapNoteToMobileNote(updated);
      applyWorkspace((current) => ({
        ...current,
        notes: current.notes.map((note) => (note.id === id ? mobileNote : note)),
      }));
    });
  }

  async function deleteNote(id: string) {
    const activeRepositories = requireRepositories();

    applyWorkspace((current) => ({
      ...current,
      notes: current.notes.filter((note) => note.id !== id),
    }));

    await queueMutation(`note:${id}`, async () => {
      await activeRepositories.notes.destroy(asNoteId(id));
    });
  }

  async function createJournalEntry() {
    const activeRepositories = requireRepositories();
    const now = new Date();
    const created = await activeRepositories.journal.createEntry({
      dateKey: toDateKey() as DateKey,
      content: "" as MarkdownContent,
      tags: [],
      mood: "neutral",
      createdAt: now,
      updatedAt: now,
    });
    const mobileEntry = mapJournalEntryToMobileJournalEntry(created);

    applyWorkspace((current) => ({
      ...current,
      journalEntries: [mobileEntry, ...current.journalEntries],
    }));

    return mobileEntry;
  }

  async function updateJournalEntry(
    id: string,
    patch: Partial<Pick<MobileJournalEntry, "content" | "dateKey" | "tags" | "mood">>,
  ) {
    const activeRepositories = requireRepositories();
    const optimisticUpdatedAt = new Date().toISOString();

    applyWorkspace((current) => ({
      ...current,
      journalEntries: current.journalEntries.map((entry) =>
        entry.id === id ? { ...entry, ...patch, updatedAt: optimisticUpdatedAt } : entry,
      ),
    }));

    await queueMutation(`journal:${id}`, async () => {
      const updated = await activeRepositories.journal.updateEntry({
        id: asJournalEntryId(id),
        content: patch.content as MarkdownContent | undefined,
        dateKey: patch.dateKey as DateKey | undefined,
        tags: patch.tags as TagName[] | undefined,
        mood: patch.mood,
        updatedAt: new Date(),
      });

      if (!updated) {
        return;
      }

      const mobileEntry = mapJournalEntryToMobileJournalEntry(updated);
      applyWorkspace((current) => ({
        ...current,
        journalEntries: current.journalEntries.map((entry) => (entry.id === id ? mobileEntry : entry)),
      }));
    });
  }

  async function deleteJournalEntry(id: string) {
    const activeRepositories = requireRepositories();

    applyWorkspace((current) => ({
      ...current,
      journalEntries: current.journalEntries.filter((entry) => entry.id !== id),
    }));

    await queueMutation(`journal:${id}`, async () => {
      await activeRepositories.journal.destroyEntry(asJournalEntryId(id));
    });
  }

  async function resetWorkspace() {
    const activeRepositories = requireRepositories();
    const workspaceSnapshot = workspaceRef.current;
    const folderRootIds = getFolderRoots(workspaceSnapshot.folders);
    const tags = await activeRepositories.journal.listTags();

    await Promise.all([
      ...workspaceSnapshot.notes.map((note) =>
        queueMutation(`note:${note.id}`, async () => {
          await activeRepositories.notes.destroy(asNoteId(note.id));
        }),
      ),
      ...workspaceSnapshot.journalEntries.map((entry) =>
        queueMutation(`journal:${entry.id}`, async () => {
          await activeRepositories.journal.destroyEntry(asJournalEntryId(entry.id));
        }),
      ),
      ...folderRootIds.map((folderId) =>
        queueMutation(`folder:${folderId}`, async () => {
          await activeRepositories.folders.destroy(asFolderId(folderId));
        }),
      ),
      ...tags.map((tag) =>
        queueMutation(`tag:${tag.id}`, async () => {
          await activeRepositories.journal.destroyTag(asTagId(tag.id));
        }),
      ),
    ]);

    applyWorkspace(EMPTY_WORKSPACE);
  }

  const value: WorkspaceContextValue = {
    isHydrated,
    workspace,
    cloudConfigured: auth.isSupabaseConfigured,
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
  };

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
