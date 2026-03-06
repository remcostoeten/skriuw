'use client'
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/haptic/TopBar';
import { BottomBar } from '@/components/haptic/BottomBar';
import { IconRail } from '@/components/haptic/IconRail';
import { SidebarPanel } from '@/components/haptic/SidebarPanel';
import { EditorToolbar, EditorMode } from '@/components/haptic/EditorToolbar';
import { Editor } from '@/components/haptic/Editor';
import { MetadataPanel } from '@/components/haptic/MetadataPanel';
import { useNotesStore } from '@/store/notesStore';

function NotesApp() {
  const store = useNotesStore();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('notes');
  const [showSidebar, setShowSidebar] = useState(true);
  const [editorMode, setEditorMode] = useState<EditorMode>('markdown');

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
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <IconRail activeTab={activeTab} onTabChange={setActiveTab} />

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
            editorMode={editorMode}
            onToggleSidebar={() => setShowSidebar(!showSidebar)}
            onToggleMetadata={() => store.setShowMetadata(!store.showMetadata)}
            onToggleEditorMode={() => setEditorMode(editorMode === 'markdown' ? 'richtext' : 'markdown')}
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
      <BottomBar />
    </div>
  );
}

export default function Index() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-haptic-bg">
        <div className="text-haptic-dim">Loading...</div>
      </div>
    }>
      <NotesApp />
    </Suspense>
  );
}
