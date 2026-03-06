import { useState } from 'react';
import { TopBar } from '@/components/haptic/TopBar';
import { BottomBar } from '@/components/haptic/BottomBar';
import { IconRail } from '@/components/haptic/IconRail';
import { SidebarPanel } from '@/components/haptic/SidebarPanel';
import { EditorToolbar } from '@/components/haptic/EditorToolbar';
import { Editor } from '@/components/haptic/Editor';
import { MetadataPanel } from '@/components/haptic/MetadataPanel';
import { useNotesStore } from '@/store/notesStore';

const Index = () => {
  const store = useNotesStore();
  const [activeTab, setActiveTab] = useState('notes');
  const [showSidebar, setShowSidebar] = useState(true);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        {/* Icon Rail */}
        <IconRail activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Sidebar */}
        {showSidebar && (
          <SidebarPanel
            files={store.files}
            folders={store.folders}
            activeFileId={store.activeFileId}
            onFileSelect={store.setActiveFileId}
            onToggleFolder={store.toggleFolder}
            onCreateFile={() => store.createFile('Untitled')}
            onCreateFolder={() => store.createFolder('Untitled')}
            getFilesInFolder={store.getFilesInFolder}
            getFoldersInFolder={store.getFoldersInFolder}
          />
        )}

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <EditorToolbar
            fileName={store.activeFile?.name || 'No file selected'}
            onToggleSidebar={() => setShowSidebar(!showSidebar)}
            onToggleMetadata={() => store.setShowMetadata(!store.showMetadata)}
          />
          <div className="flex-1 flex overflow-hidden">
            <Editor
              file={store.activeFile}
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
};

export default Index;
