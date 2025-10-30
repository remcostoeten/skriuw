import { Toolbar } from './toolbar';
import { SearchBar } from '../search-bar';
import { FolderList } from '../folder-list';
import { useSearch } from '@/hooks/use-search';
import type { Folder } from '@/api/db/schema';

type SidebarProps = {
  folders: Folder[];
  onNewNote?: () => void;
  onNewFolder?: () => void;
  onToggleFullscreen?: () => void;
  onFolderClick?: (folder: Folder) => void;
  className?: string;
};

export function Sidebar({
  folders,
  onNewNote,
  onNewFolder,
  onToggleFullscreen,
  onFolderClick,
  className = ""
}: SidebarProps) {
  const search = useSearch();

  // Transform folder data to match our interface
  const transformedFolders = folders
    .filter(folder => !folder.deletedAt && !folder.parent) // Only show root folders
    .map(folder => ({
      id: folder.id,
      name: folder.name,
      count: folder.notes?.length || 0,
      path: `/${folder.name}`,
      originalFolder: folder // Keep original data for callbacks
    }));

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      <div className="relative top-0 flex flex-col h-10 w-full border-b bg-background overflow-hidden">
        <Toolbar
          isSearchOpen={search.isOpen}
          onSearchToggle={search.toggle}
          onNewNote={onNewNote}
          onNewFolder={onNewFolder}
          onToggleFullscreen={onToggleFullscreen}
        />

        <div className={`absolute pb-[0.5px] flex flex-row items-center justify-center w-full h-full px-[5px] gap-1 shrink-0 transition-all duration-300 ${search.isOpen ? 'translate-y-0' : 'translate-y-12'}`}>
          <SearchBar
            query={search.query}
            onQueryChange={search.setQuery}
            options={search.options}
            onOptionsChange={search.setOptions}
            onClose={search.close}
          />
        </div>
      </div>

      <FolderList
        folders={transformedFolders}
        searchQuery={search.query}
        searchOptions={search.options}
        onFolderClick={(transformedFolder) => {
          onFolderClick?.(transformedFolder.originalFolder);
        }}
      />
    </div>
  );
}