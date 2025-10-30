import { Sidebar } from './sidebar';

// Example data - replace with actual data from your API
const exampleFolders = [
  { id: '1', name: 'Untitled', position: 0, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: undefined },
  { id: '2', name: 'Design Notes', position: 1, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: undefined },
  { id: '3', name: 'Meeting Minutes', position: 2, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: undefined },
  { id: '4', name: 'Code Snippets', position: 3, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: undefined }
];

export function SidebarExample() {
  return (
    <Sidebar
      folders={exampleFolders}
      onNewNote={() => console.log('New note')}
      onNewFolder={() => console.log('New folder')}
      onToggleFullscreen={() => console.log('Toggle fullscreen')}
      onFolderClick={(folder) => console.log('Clicked folder:', folder)}
    />
  );
}