export type SearchableSettingsSection<T extends string = string> = {
  id: T;
  label: string;
  description: string;
  searchText: string;
};

export type SectionNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

function searchTokens(query: string): string[] {
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function filterSettingsSections<T extends SearchableSettingsSection>(
  sections: readonly T[],
  query: string,
): T[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [...sections];
  }
  return sections.filter((section) => {
    const content = `${section.label} ${section.description} ${section.searchText}`.toLocaleLowerCase();
    return tokens.every((token) => content.includes(token));
  });
}

export function rovingSettingsSection<T extends string>(
  sectionIds: readonly T[],
  activeId: T,
): T | undefined {
  return sectionIds.includes(activeId) ? activeId : sectionIds[0];
}

export function moveSettingsSection<T extends string>(
  sectionIds: readonly T[],
  currentId: T,
  key: SectionNavigationKey,
): T | undefined {
  if (sectionIds.length === 0) {
    return undefined;
  }
  if (key === "Home") {
    return sectionIds[0];
  }
  if (key === "End") {
    return sectionIds.at(-1);
  }
  const currentIndex = sectionIds.indexOf(currentId);
  const start = currentIndex < 0 ? 0 : currentIndex;
  const offset = key === "ArrowDown" ? 1 : -1;
  return sectionIds[(start + offset + sectionIds.length) % sectionIds.length];
}
