export type SearchableSettingsSection<T extends string = string> = {
  id: T;
  label: string;
  description: string;
  searchText: string;
  copy?: readonly string[];
};

export type SectionNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export type SettingsSearchEscape = "clear-query" | "close-dialog" | "ignore";

/**
 * Resolves what Escape means while the settings search field holds focus. The
 * field has to own the key because `input[type=search]` cancels itself on
 * Escape natively, so the surrounding `<dialog>` never gets a close request.
 */
export function settingsSearchEscape(
  query: string,
  recordingShortcut: boolean,
): SettingsSearchEscape {
  if (query) {
    return "clear-query";
  }
  return recordingShortcut ? "ignore" : "close-dialog";
}

function searchTokens(query: string): string[] {
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function sectionHaystack(section: SearchableSettingsSection): string {
  const copy = section.copy?.join(" ") ?? "";
  return `${section.label} ${section.description} ${section.searchText} ${copy}`
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @name filterSettingsSections
 * @description Keeps the sections whose label, description or copy match the
 * query. Sections containing the whole query as a phrase win; only when none
 * do does it fall back to sections containing every word, so a pasted
 * sentence from one row does not light up every section sharing its words.
 *
 * @example
 * filterSettingsSections(sections, "no note references"); // [media]
 */
export function filterSettingsSections<T extends SearchableSettingsSection>(
  sections: readonly T[],
  query: string,
): T[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [...sections];
  }
  const haystacks = sections.map((section) => [section, sectionHaystack(section)] as const);
  const phrase = tokens.join(" ");
  const phraseMatches = haystacks.filter(([, haystack]) => haystack.includes(phrase));
  const matches =
    tokens.length > 1 && phraseMatches.length > 0
      ? phraseMatches
      : haystacks.filter(([, haystack]) => tokens.every((token) => haystack.includes(token)));
  return matches.map(([section]) => section);
}

export function rovingSettingsSection<T extends string>(
  sectionIds: readonly T[],
  activeId: T,
): T | undefined {
  return sectionIds.includes(activeId) ? activeId : sectionIds[0];
}

export function activeSettingsSection<T extends string>(
  filteredIds: readonly T[],
  availableIds: readonly T[],
  currentId: T,
): T | undefined {
  return (
    rovingSettingsSection(filteredIds, currentId) ??
    (availableIds.includes(currentId) ? currentId : availableIds[0])
  );
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

/**
 * @name settingsSearchSnippet
 * @description Picks the line of section copy that explains why a section
 * matched the query, preferring a line with the whole phrase over one holding
 * every word. Returns undefined when only the curated keywords matched.
 *
 * @example
 * settingsSearchSnippet(media, "no note references");
 * // "Deletes every image that no note references. This cannot be undone."
 */
export function settingsSearchSnippet(
  section: SearchableSettingsSection,
  query: string,
): string | undefined {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return undefined;
  }
  const lines = section.copy ?? [];
  const phrase = tokens.join(" ");
  const lowered = lines.map((line) => [line, line.toLocaleLowerCase()] as const);
  const match =
    lowered.find(([, text]) => text.includes(phrase)) ??
    lowered.find(([, text]) => tokens.every((token) => text.includes(token)));
  return match?.[0];
}
