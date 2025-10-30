import { matchesSearch } from '@/lib/search-utils';
import type { SearchOptions } from '@/hooks/use-search';
import { FolderItem } from './folder-item';

type FolderItem = {
  id: string;
  name: string;
  count: number;
  path: string;
};

type FolderListProps = {
  folders: FolderItem[];
  searchQuery: string;
  searchOptions: SearchOptions;
  onFolderClick?: (folder: FolderItem) => void;
};

export function FolderList({
  folders,
  searchQuery,
  searchOptions,
  onFolderClick
}: FolderListProps) {
  const filteredFolders = folders.filter(folder =>
    matchesSearch(folder.name, searchQuery, searchOptions)
  );

  return (
    <div className="flex flex-col items-start gap-1 w-full px-2 h-full overflow-auto pt-2 pb-4">
      {filteredFolders.length === 0 && searchQuery && (
        <div className="w-full text-center text-xs text-muted-foreground py-4">
          No results found
        </div>
      )}
      {filteredFolders.map((folder) => (
        <FolderItem
          key={folder.id}
          folder={folder}
          searchQuery={searchQuery}
          searchOptions={searchOptions}
          isHighlighted={!!searchQuery && matchesSearch(folder.name, searchQuery, searchOptions)}
          onClick={onFolderClick}
        />
      ))}
    </div>
  );
}