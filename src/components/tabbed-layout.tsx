"use client";

import { useEffect, useState, useCallback } from 'react';
import { TabSystem } from '@/components/tabs-system';
import { NoteEditor } from '@/components/note-editor';
import { ErrorBoundary } from '@/components/error-boundary';
import { useTabsManager } from '@/hooks/use-tabs-manager';
import { useNativeMenus, useContextMenu } from '@/components/native-menus';
import { NativeUtils } from '@/utils/native-utils';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import type { Note } from '@/api/db/schema';

interface TabbedLayoutProps {
  initialNote?: Note;
  onNoteSelect?: (noteId: string) => void;
}

export function TabbedLayout({ initialNote, onNoteSelect }: TabbedLayoutProps) {
  const { notes } = useGetNotes();
  const [activeNoteId, setActiveNoteId] = useState<string | null>(
    initialNote?.id || null
  );

  const tabsManager = useTabsManager(notes);

  // Initialize with initial note if provided
  useEffect(() => {
    if (initialNote && !tabsManager.isNoteOpen(initialNote.id)) {
      tabsManager.openNoteInTab(initialNote.id, initialNote.title);
    }
  }, [initialNote, tabsManager]);

  // Setup native menus
  const { setupMenus } = useNativeMenus(undefined, (actionId: string) => {
    handleMenuAction(actionId);
  });

  // Setup context menu for tab bar
  const contextMenuItems = [
    {
      id: 'new-tab',
      label: 'New Tab',
      type: 'item' as const,
      action: () => handleNewTab()
    },
    {
      id: 'close-tab',
      label: 'Close Tab',
      type: 'item' as const,
      action: () => {
        if (tabsManager.activeTab) {
          tabsManager.closeTab(tabsManager.activeTab.id);
        }
      }
    },
    {
      id: 'close-other-tabs',
      label: 'Close Other Tabs',
      type: 'item' as const,
      action: () => {
        if (tabsManager.activeTab) {
          tabsManager.closeOtherTabs(tabsManager.activeTab.id);
        }
      }
    },
    {
      id: 'close-all-tabs',
      label: 'Close All Tabs',
      type: 'item' as const,
      action: () => tabsManager.closeAllTabs()
    }
  ];

  const { showContextMenu } = useContextMenu(contextMenuItems, (actionId: string) => {
    handleMenuAction(actionId);
  });

  const handleMenuAction = useCallback((actionId: string) => {
    switch (actionId) {
      case 'new-note':
        handleNewNote();
        break;
      case 'open-file':
        handleOpenFile();
        break;
      case 'save':
      case 'save-as':
        handleSaveFile(actionId === 'save-as');
        break;
      case 'export-markdown':
      case 'export-pdf':
      case 'export-html':
        handleExport(actionId.replace('export-', ''));
        break;
      case 'quit':
        NativeUtils.Window.close();
        break;
      case 'close-tab':
        if (tabsManager.activeTab) {
          tabsManager.closeTab(tabsManager.activeTab.id);
        }
        break;
      case 'toggle-sidebar':
        window.dispatchEvent(new CustomEvent('menu:toggle-sidebar'));
        break;
      case 'always-on-top':
        // Toggle always on top (would need state tracking)
        NativeUtils.Window.setAlwaysOnTop(true);
        break;
      case 'minimize':
        NativeUtils.Window.minimize();
        break;
      case 'maximize':
        NativeUtils.Window.maximize();
        break;
      default:
        console.log('Unknown menu action:', actionId);
    }
  }, [tabsManager]);

  const handleNewNote = useCallback(() => {
    // Create a new note and open it in a tab
    // This would need to integrate with your note creation logic
    const newNoteId = `note-${Date.now()}`;
    tabsManager.openNoteInTab(newNoteId, 'New Note');
  }, [tabsManager]);

  const handleNewTab = useCallback(() => {
    if (notes.length > 0) {
      // Open first available note in new tab
      const availableNote = notes.find(note => !tabsManager.isNoteOpen(note.id)) || notes[0];
      tabsManager.openNoteInTab(availableNote.id, availableNote.title);
    }
  }, [notes, tabsManager]);

  const handleOpenFile = useCallback(async () => {
    const result = await NativeUtils.Dialogs.openFile({
      title: 'Open Note',
      filters: [
        { name: 'Markdown Files', extensions: ['md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.success && result.path) {
      // Handle file opening logic
      console.log('Opening file:', result.path);
    }
  }, []);

  const handleSaveFile = useCallback(async (saveAs = false) => {
    if (!tabsManager.activeTab) return;

    const activeTab = tabsManager.activeTab;
    const note = notes.find(n => n.id === activeTab.noteId);
    const defaultPath = note ? `${note.title || 'Untitled'}.md` : 'Untitled.md';

    const result = await NativeUtils.Dialogs.saveFile({
      title: saveAs ? 'Save As' : 'Save',
      defaultPath,
      filters: [
        { name: 'Markdown Files', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.success && result.path) {
      // Handle file saving logic
      console.log('Saving file:', result.path);
    }
  }, [tabsManager.activeTab, notes]);

  const handleExport = useCallback(async (format: string) => {
    if (!tabsManager.activeTab) return;

    const activeTab = tabsManager.activeTab;
    const note = notes.find(n => n.id === activeTab.noteId);
    const defaultPath = note ? `${note.title || 'Untitled'}.${format}` : `Untitled.${format}`;

    const result = await NativeUtils.Dialogs.saveFile({
      title: `Export as ${format.toUpperCase()}`,
      defaultPath,
      filters: [
        { name: `${format.toUpperCase()} Files`, extensions: [format] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.success && result.path) {
      // Handle export logic
      console.log(`Exporting as ${format}:`, result.path);
    }
  }, [tabsManager.activeTab, notes]);

  const handleTabSelect = useCallback((tabId: string) => {
    tabsManager.selectTab(tabId);
  }, [tabsManager]);

  const handleTabClose = useCallback((tabId: string) => {
    tabsManager.closeTab(tabId);
  }, [tabsManager]);

  const handleTabReorder = useCallback((fromIndex: number, toIndex: number) => {
    tabsManager.reorderTabs(fromIndex, toIndex);
  }, [tabsManager]);

  const handleNoteSelect = useCallback((noteId: string) => {
    setActiveNoteId(noteId);
    tabsManager.openNoteInTab(noteId);
    if (onNoteSelect) {
      onNoteSelect(noteId);
    }
  }, [tabsManager, onNoteSelect]);

  // Update window title based on active tab
  useEffect(() => {
    if (tabsManager.activeTab) {
      const note = notes.find(n => n.id === tabsManager.activeTab?.noteId);
      const title = note?.title || 'Untitled';
      NativeUtils.Window.setTitle(`${title} - Notes App`);
    } else {
      NativeUtils.Window.setTitle('Notes App');
    }
  }, [tabsManager.activeTab, notes]);

  // Handle global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + T for new tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        handleNewTab();
      }

      // Ctrl/Cmd + W for close tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (tabsManager.activeTab) {
          tabsManager.closeTab(tabsManager.activeTab.id);
        }
      }

      // Ctrl/Cmd + Tab for next tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabsManager.tabs.findIndex(tab => tab.isActive);
        const nextIndex = (currentIndex + 1) % tabsManager.tabs.length;
        if (tabsManager.tabs[nextIndex]) {
          tabsManager.selectTab(tabsManager.tabs[nextIndex].id);
        }
      }

      // Ctrl/Cmd + Shift + Tab for previous tab
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = tabsManager.tabs.findIndex(tab => tab.isActive);
        const prevIndex = currentIndex === 0 ? tabsManager.tabs.length - 1 : currentIndex - 1;
        if (tabsManager.tabs[prevIndex]) {
          tabsManager.selectTab(tabsManager.tabs[prevIndex].id);
        }
      }

      // Ctrl/Cmd + F for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('menu:toggle-search'));
      }

      // Escape to close search
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('menu:close-search'));
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleNewTab, tabsManager]);

  const activeTab = tabsManager.activeTab;
  const activeNote = activeTab ? notes.find(n => n.id === activeTab.noteId) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Tab System */}
      <div
        onContextMenu={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.tab-system')) {
            showContextMenu(e);
          }
        }}
        className="tab-system"
      >
        <TabSystem
          openTabs={tabsManager.tabs}
          onTabSelect={handleTabSelect}
          onTabClose={handleTabClose}
          onNewTab={handleNewTab}
          onTabReorder={handleTabReorder}
          notes={notes}
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeNote ? (
          <ErrorBoundary
            fallback={({ error, retry }) => (
              <div className="h-full flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Error Loading Note
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {error?.message || 'Something went wrong while loading this note.'}
                  </p>
                  <button
                    onClick={retry}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors mr-2"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => tabsManager.closeTab(activeTab.id)}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Close Tab
                  </button>
                </div>
              </div>
            )}
          >
            <NoteEditor
              note={activeNote}
              onNoteSelect={handleNoteSelect}
            />
          </ErrorBoundary>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">📝</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Note Selected
              </h3>
              <p className="text-gray-600 mb-4">
                Open a note from the sidebar or create a new one to get started.
              </p>
              <button
                onClick={handleNewTab}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Open Note in Tab
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}