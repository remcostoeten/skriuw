import { Sidebar } from './sidebar';

// Example data - replace with actual data from your API
const exampleFolders = [
  { id: '1', name: 'Untitled', count: 2, path: '/Haptic/Untitled' },
  { id: '2', name: 'Design Notes', count: 5, path: '/Haptic/Design' },
  { id: '3', name: 'Meeting Minutes', count: 12, path: '/Haptic/Meetings' },
  { id: '4', name: 'Code Snippets', count: 8, path: '/Haptic/Code' }
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