import type { SearchOptions } from '@/hooks/use-search';

export function highlightText(text: string, query: string, options: SearchOptions): string {
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
}

export function matchesSearch(
  text: string,
  query: string,
  options: SearchOptions
): boolean {
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
}

export function filterItems<T extends { name: string; title?: string }>(
  items: T[],
  query: string,
  options: SearchOptions
): T[] {
  if (!query) return items;

  return items.filter(item => {
    const searchableText = [item.name, item.title].filter(Boolean).join(' ');
    return matchesSearch(searchableText, query, options);
  });
}