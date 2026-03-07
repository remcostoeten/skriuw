'use client';

import { useState, useMemo } from 'react';
import { Search, FileText, Folder, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NoteFile, NoteFolder } from '@/types/notes';

type Props = {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  onFileSelect: (id: string) => void;
  onFolderSelect: (id: string) => void;
};

export function SearchSection({
  files,
  folders,
  activeFileId,
  onFileSelect,
  onFolderSelect,
}: Props) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) return { files: [], folders: [] };
    
    const lowerQuery = query.toLowerCase();
    
    const matchingFiles = files.filter(f => 
      f.name.toLowerCase().includes(lowerQuery) ||
      f.content.toLowerCase().includes(lowerQuery)
    );
    
    const matchingFolders = folders.filter(f => 
      f.name.toLowerCase().includes(lowerQuery)
    );
    
    return { files: matchingFiles, folders: matchingFolders };
  }, [query, files, folders]);

  const hasResults = results.files.length > 0 || results.folders.length > 0;
  const showResults = query.trim() && isFocused;

  return (
    <div className="px-3 py-2 border-b border-border/50">
      <div className={cn(
        "relative flex items-center gap-2 rounded-md px-2 py-1.5 bg-accent/30 border border-transparent transition-colors",
        isFocused && "border-ring bg-accent/50"
      )}>
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          placeholder="Search notes..."
          className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3 h-3" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Search results dropdown */}
      {showResults && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {hasResults ? (
            <>
              {results.folders.length > 0 && (
                <div className="p-1">
                  <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Folders
                  </p>
                  {results.folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        onFolderSelect(folder.id);
                        setQuery('');
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-foreground/80 hover:bg-accent transition-colors"
                    >
                      <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                      <span className="text-[13px] truncate">{folder.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.files.length > 0 && (
                <div className="p-1">
                  <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Files
                  </p>
                  {results.files.slice(0, 10).map((file) => (
                    <button
                      key={file.id}
                      onClick={() => {
                        onFileSelect(file.id);
                        setQuery('');
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors",
                        file.id === activeFileId
                          ? "bg-accent text-foreground"
                          : "text-foreground/80 hover:bg-accent"
                      )}
                    >
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                      <span className="text-[13px] truncate">{file.name}</span>
                    </button>
                  ))}
                  {results.files.length > 10 && (
                    <p className="px-2 py-1 text-[10px] text-muted-foreground">
                      +{results.files.length - 10} more results
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground">No results found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
