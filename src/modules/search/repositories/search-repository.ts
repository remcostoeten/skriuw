import type { Folder, Note } from '@/api/db/schema';

export type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
};

export type SearchResult<T> = {
  item: T;
  highlightedText: string;
  matches: boolean;
};

// Pure search functions following functional repository pattern
export const searchRepository = {
  // Core search utilities
  highlightText: (text: string, query: string, options: SearchOptions): string => {
    if (!query) return text;

    let searchText = text;
    let searchQuery = query;

    if (!options.caseSensitive) {
      searchText = text.toLowerCase();
      searchQuery = query.toLowerCase();
    }

    if (options.wholeWord) {
      const regex = new RegExp(`\\b${searchQuery}\\b`, options.caseSensitive ? 'g' : 'gi');
      const matches = text.match(regex);
      if (!matches) return text;

      return text.split(regex).reduce((acc, part, i) => {
        if (i === 0) return part;
        return acc + `<mark class="bg-yellow-300 dark:bg-yellow-600 text-foreground rounded px-0.5">${matches[i - 1]}</mark>` + part;
      }, '');
    }

    const index = searchText.indexOf(searchQuery);
    if (index === -1) return text;

    const before = text.slice(0, index);
    const match = text.slice(index, index + query.length);
    const after = text.slice(index + query.length);

    return `${before}<mark class="bg-yellow-300 dark:bg-yellow-600 text-foreground rounded px-0.5">${match}</mark>${after}`;
  },

  matchesSearch: (text: string, query: string, options: SearchOptions): boolean => {
    const trimmed = query.trim();
    if (!trimmed) return true;

    const normalize = (s: string) => s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    let searchTarget = normalize(text);
    let searchQuery = normalize(trimmed);

    if (!options.caseSensitive) {
      searchTarget = text.toLowerCase();
      searchQuery = query.toLowerCase();
    }

    if (options.wholeWord) {
      if (searchQuery.length <= 1) {
        return searchTarget.includes(searchQuery);
      }
      const regex = new RegExp(`\\b${searchQuery}\\b`, options.caseSensitive ? 'g' : 'gi');
      return regex.test(searchTarget);
    }

    return searchTarget.includes(searchQuery);
  },

  // Folder-specific search functions
  searchFolders: (folders: Folder[], query: string, options: SearchOptions): SearchResult<Folder>[] => {
    return folders
      .filter(folder => !folder.deletedAt)
      .map(folder => ({
        item: folder,
        highlightedText: searchRepository.highlightText(folder.name, query, options),
        matches: searchRepository.matchesSearch(folder.name, query, options)
      }))
      .filter(result => result.matches);
  },

  // Note-specific search functions
  searchNotes: (notes: Note[], query: string, options: SearchOptions): SearchResult<Note>[] => {
    return notes.map(note => ({
      item: note,
      highlightedText: searchRepository.highlightText(note.title, query, options),
      matches: searchRepository.matchesSearch(note.title, query, options)
    })).filter(result => result.matches);
  },

  // Combined search for sidebar
  searchSidebar: (folders: Folder[], notes: Note[], query: string, options: SearchOptions) => {
    const rootFolders = folders.filter(f => !f.parent && !f.deletedAt);
    const rootNotes = notes.filter(n => !n.folder);

    return {
      folders: searchRepository.searchFolders(rootFolders, query, options),
      notes: searchRepository.searchNotes(rootNotes, query, options)
    };
  }
};

export type SearchRepository = typeof searchRepository;