'use client'
import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { BottomBar } from '@/components/haptic/BottomBar';
import { IconRail } from '@/components/haptic/IconRail';
import { SidebarPanel } from '@/components/haptic/SidebarPanel';
import { EditorToolbar, EditorMode } from '@/components/haptic/EditorToolbar';
import { Editor } from '@/components/haptic/Editor';
import { MetadataPanel } from '@/components/haptic/MetadataPanel';
import { SettingsModal } from '@/components/haptic/SettingsModal';
import { useNotesStore } from '@/store/notesStore';
import { useSettingsStore } from '@/modules/settings';

function NotesApp() {
  const store = useNotesStore();
  const { settings, initializeSettings } = useSettingsStore();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('notes');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('markdown');

  // Initialize settings on mount
  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  // Sync editor mode with settings default
  useEffect(() => {
    if (settings) {
      setEditorMode(settings.defaultModeMarkdown ? 'markdown' : 'richtext');
    }
  }, [settings?.defaultModeMarkdown]);

  // File navigation - get current index and navigation ability
  const currentFileIndex = useMemo(() => 
    store.files.findIndex(f => f.id === store.activeFileId), 
    [store.files, store.activeFileId]
  );
  const canNavigatePrev = currentFileIndex > 0;
  const canNavigateNext = currentFileIndex < store.files.length - 1;

  const navigatePrev = useCallback(() => {
    if (canNavigatePrev) {
      const prevFile = store.files[currentFileIndex - 1];
      store.setActiveFileId(prevFile.id);
      const url = new URL(window.location.href);
      url.searchParams.set('note', prevFile.id);
      window.history.pushState({}, '', url.toString());
    }
  }, [canNavigatePrev, currentFileIndex, store]);

  const navigateNext = useCallback(() => {
    if (canNavigateNext) {
      const nextFile = store.files[currentFileIndex + 1];
      store.setActiveFileId(nextFile.id);
      const url = new URL(window.location.href);
      url.searchParams.set('note', nextFile.id);
      window.history.pushState({}, '', url.toString());
    }
  }, [canNavigateNext, currentFileIndex, store]);

  // Sync URL with active note (shallow routing - no server round trip)
  useEffect(() => {
    const noteId = searchParams.get('note');
    if (noteId && store.files.some(f => f.id === noteId)) {
      store.setActiveFileId(noteId);
    }
  }, [searchParams, store.files, store.setActiveFileId]);

  // Update URL when note changes (shallow - no navigation delay)
  const handleFileSelect = (id: string) => {
    store.setActiveFileId(id);
    // Use shallow routing to update URL without triggering navigation
    const url = new URL(window.location.href);
    url.searchParams.set('note', id);
    window.history.pushState({}, '', url.toString());
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <IconRail 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          onOpenSettings={() => setShowSettings(true)}
        />

        {showSidebar && (
          <SidebarPanel
            files={store.files}
            folders={store.folders}
            activeFileId={store.activeFileId}
            onFileSelect={handleFileSelect}
            onToggleFolder={store.toggleFolder}
            onCreateFile={() => store.createFile('Untitled')}
            onCreateFolder={() => store.createFolder('Untitled')}
            onRenameFile={store.renameFile}
            onRenameFolder={store.renameFolder}
            onDeleteFile={store.deleteFile}
            onDeleteFolder={store.deleteFolder}
            onMoveFile={store.moveFile}
            onMoveFolder={store.moveFolder}
            getFilesInFolder={store.getFilesInFolder}
            getFoldersInFolder={store.getFoldersInFolder}
            countDescendants={store.countDescendants}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <EditorToolbar
            fileName={store.activeFile?.name || 'No file selected'}
            onToggleSidebar={() => setShowSidebar(!showSidebar)}
            onToggleMetadata={() => store.setShowMetadata(!store.showMetadata)}
            onNavigatePrev={navigatePrev}
            onNavigateNext={navigateNext}
            canNavigatePrev={canNavigatePrev}
            canNavigateNext={canNavigateNext}
          />
          <div className="flex-1 flex overflow-hidden">
            <Editor
              file={store.activeFile}
              editorMode={editorMode}
              onContentChange={store.updateFileContent}
            />
            {store.showMetadata && (
              <MetadataPanel file={store.activeFile} />
            )}
          </div>
        </div>
      </div>
      <BottomBar 
        editorMode={editorMode} 
        onToggleEditorMode={() => setEditorMode(editorMode === 'markdown' ? 'richtext' : 'markdown')} 
      />
      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}

export default function Index() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <NotesApp />
    </Suspense>
  );
}
