import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getWorkspaceId } from "@/platform/auth";
import { NoteFile, NoteFolder } from "@/types/notes";

export interface DocumentMetadata {
  id: string;
  tags: string[];
  mood?: string;
  wordCount: number;
  characterCount: number;
  readTime: number;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date;
}

export interface UIState {
  showSidebar: boolean;
  showMetadata: boolean;
  activePanel: 'properties' | 'outline' | null;
  sidebarWidth: number;
  isMobile: boolean;
}

const DEFAULT_UI_STATE: UIState = {
  showSidebar: true,
  showMetadata: false,
  activePanel: null,
  sidebarWidth: 296,
  isMobile: false,
};

interface DocumentState {
  currentWorkspaceId: string;
  // Core document data
  documents: Map<string, NoteFile>;
  folders: Map<string, NoteFolder>;
  activeDocumentId: string | null;
  
  // Document metadata
  metadata: Map<string, DocumentMetadata>;
  
  // UI state
  ui: UIState;

  syncWorkspace: (workspaceId: string) => Promise<void>;
  
  // Actions - Documents
  setDocuments: (documents: NoteFile[]) => void;
  addDocument: (document: NoteFile) => void;
  updateDocument: (id: string, updates: Partial<NoteFile>) => void;
  deleteDocument: (id: string) => void;
  setActiveDocument: (id: string | null) => void;
  
  // Actions - Folders
  setFolders: (folders: NoteFolder[]) => void;
  addFolder: (folder: NoteFolder) => void;
  updateFolder: (id: string, updates: Partial<NoteFolder>) => void;
  deleteFolder: (id: string) => void;
  
  // Actions - Metadata
  updateMetadata: (id: string, metadata: Partial<DocumentMetadata>) => void;
  recalculateMetadata: (id: string, content: string) => void;
  
  // Actions - UI
  setUIState: (updates: Partial<UIState>) => void;
  toggleSidebar: () => void;
  toggleMetadata: () => void;
  setActivePanel: (panel: 'properties' | 'outline' | null) => void;
  setSidebarWidth: (width: number) => void;
  setIsMobile: (isMobile: boolean) => void;
  
  // Selectors
  getActiveDocument: () => NoteFile | null;
  getDocumentMetadata: (id: string) => DocumentMetadata | null;
  getDocumentsInFolder: (folderId?: string) => NoteFile[];
}

const DOCUMENT_STORE_KEY_PREFIX = "document-store";

function getWorkspaceStoreKey(workspaceId: string) {
  return `${DOCUMENT_STORE_KEY_PREFIX}:${workspaceId}`;
}

const calculateMetadata = (content: string): Omit<DocumentMetadata, 'id' | 'createdAt' | 'updatedAt' | 'lastAccessedAt'> => {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const characterCount = content.length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));
  
  return {
    tags: [],
    wordCount,
    characterCount,
    readTime,
  };
};

export const useDocumentStore = create<DocumentState>()(
  persist(
    (set, get) => ({
      currentWorkspaceId: getWorkspaceId(),
      // Initial state
      documents: new Map(),
      folders: new Map(),
      activeDocumentId: null,
      metadata: new Map(),
      ui: { ...DEFAULT_UI_STATE },

      syncWorkspace: async (workspaceId) => {
        if (workspaceId === get().currentWorkspaceId) {
          return;
        }

        set({
          currentWorkspaceId: workspaceId,
          documents: new Map(),
          folders: new Map(),
          activeDocumentId: null,
          metadata: new Map(),
          ui: { ...DEFAULT_UI_STATE },
        });

        useDocumentStore.persist.setOptions({ name: getWorkspaceStoreKey(workspaceId) });
        await useDocumentStore.persist.rehydrate();
      },

      // Document actions
      setDocuments: (documents) => {
        set({ documents: new Map(documents.map(d => [d.id, d])) });
      },
      
      addDocument: (document) => {
        set(state => ({
          documents: new Map(state.documents).set(document.id, document),
          metadata: new Map(state.metadata).set(document.id, {
            id: document.id,
            ...calculateMetadata(document.content),
            createdAt: document.createdAt,
            updatedAt: document.modifiedAt,
            lastAccessedAt: new Date(),
          })
        }));
      },
      
      updateDocument: (id, updates) => {
        set(state => {
          const current = state.documents.get(id);
          if (!current) return state;
          
          const updated = { ...current, ...updates };
          const currentMeta = state.metadata.get(id);
          const metadataUpdates = 'content' in updates 
            ? calculateMetadata(updates.content || '')
            : {};
          
          const newMetadata: DocumentMetadata = {
            id,
            tags: currentMeta?.tags || [],
            mood: currentMeta?.mood,
            wordCount: currentMeta?.wordCount || 0,
            characterCount: currentMeta?.characterCount || 0,
            readTime: currentMeta?.readTime || 0,
            createdAt: currentMeta?.createdAt || new Date(),
            ...metadataUpdates,
            updatedAt: new Date(),
            lastAccessedAt: new Date(),
          };
          
          return {
            documents: new Map(state.documents).set(id, updated),
            metadata: new Map(state.metadata).set(id, newMetadata)
          };
        });
      },
      
      deleteDocument: (id) => {
        set(state => ({
          documents: new Map([...state.documents].filter(([docId]) => docId !== id)),
          metadata: new Map([...state.metadata].filter(([metaId]) => metaId !== id)),
          activeDocumentId: state.activeDocumentId === id ? null : state.activeDocumentId,
        }));
      },
      
      setActiveDocument: (id) => {
        set({ activeDocumentId: id });
        if (id) {
          get().updateMetadata(id, { lastAccessedAt: new Date() });
        }
      },
      
      // Folder actions
      setFolders: (folders) => {
        set({ folders: new Map(folders.map(f => [f.id, f])) });
      },
      
      addFolder: (folder) => {
        set(state => ({
          folders: new Map(state.folders).set(folder.id, folder)
        }));
      },
      
      updateFolder: (id, updates) => {
        set(state => {
          const current = state.folders.get(id);
          if (!current) return state;
          
          return {
            folders: new Map(state.folders).set(id, { ...current, ...updates })
          };
        });
      },
      
      deleteFolder: (id) => {
        set(state => ({
          folders: new Map([...state.folders].filter(([folderId]) => folderId !== id))
        }));
      },
      
      // Metadata actions
      updateMetadata: (id, metadata) => {
        set(state => {
          const current = state.metadata.get(id);
          if (!current) return state;
          
          return {
            metadata: new Map(state.metadata).set(id, { ...current, ...metadata })
          };
        });
      },
      
      recalculateMetadata: (id, content) => {
        const metadata = calculateMetadata(content);
        get().updateMetadata(id, metadata);
      },
      
      // UI actions
      setUIState: (updates) => {
        set(state => ({
          ui: { ...state.ui, ...updates }
        }));
      },
      
      toggleSidebar: () => {
        set(state => ({
          ui: { ...state.ui, showSidebar: !state.ui.showSidebar }
        }));
      },
      
      toggleMetadata: () => {
        set(state => ({
          ui: { ...state.ui, showMetadata: !state.ui.showMetadata }
        }));
      },
      
      setActivePanel: (panel) => {
        set(state => ({
          ui: { ...state.ui, activePanel: panel }
        }));
      },
      
      setSidebarWidth: (width) => {
        set(state => ({
          ui: { ...state.ui, sidebarWidth: width }
        }));
      },
      
      setIsMobile: (isMobile) => {
        set(state => ({
          ui: { 
            ...state.ui, 
            isMobile,
            showSidebar: !isMobile,
            showMetadata: false
          }
        }));
      },
      
      // Selectors
      getActiveDocument: () => {
        const { activeDocumentId, documents } = get();
        return activeDocumentId ? documents.get(activeDocumentId) || null : null;
      },
      
      getDocumentMetadata: (id) => {
        return get().metadata.get(id) || null;
      },
      
      getDocumentsInFolder: (folderId) => {
        const { documents } = get();
        return Array.from(documents.values()).filter(doc => doc.parentId === (folderId ?? null));
      },
    }),
    {
      name: getWorkspaceStoreKey(getWorkspaceId()),
      partialize: (state) => ({
        ui: state.ui,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ui: {
          ...DEFAULT_UI_STATE,
          ...((persistedState as Partial<DocumentState> | undefined)?.ui),
        },
      }),
    }
  )
);
