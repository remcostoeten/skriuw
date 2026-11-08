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

export type SettingsSearchRow = {
  label: string;
  detail: string;
};

export type SettingsSearchGroup = {
  id: string;
  title: string;
  hint: string;
  keywords: string;
  rows: readonly SettingsSearchRow[];
};

export type SettingsGroupHit = {
  id: string;
  title: string;
  rows: readonly SettingsSearchRow[];
  wholeGroup: boolean;
};

export type SettingsSectionHit<T> = {
  section: T;
  groups: readonly SettingsGroupHit[];
  count: number;
};

// Matches the token at the start of a word, so "lock" finds "Lock now" but not "Block handle".
const WORD_BOUNDARY = /[^\p{L}\p{N}]/u;

function startsWord(haystack: string, token: string): boolean {
  let index = haystack.indexOf(token);
  while (index !== -1) {
    if (index === 0 || WORD_BOUNDARY.test(haystack.charAt(index - 1))) {
      return true;
    }
    index = haystack.indexOf(token, index + 1);
  }
  return false;
}

function containsEvery(text: string, tokens: readonly string[]): boolean {
  const haystack = text.toLocaleLowerCase();
  return tokens.every((token) => startsWord(haystack, token));
}

function groupHit(
  section: SearchableSettingsSection,
  group: SettingsSearchGroup,
  tokens: readonly string[],
): SettingsGroupHit | null {
  const groupText = `${section.label} ${group.title} ${group.hint} ${group.keywords}`;
  if (containsEvery(groupText, tokens)) {
    return { id: group.id, title: group.title, rows: group.rows, wholeGroup: true };
  }
  const rows = group.rows.filter((row) =>
    containsEvery(`${groupText} ${row.label} ${row.detail}`, tokens),
  );
  return rows.length === 0 ? null : { id: group.id, title: group.title, rows, wholeGroup: false };
}

/**
 * @name searchSettingsRows
 * @description Matches a query against every row of every visible section,
 * using the generated index of groups and rows. A row matches when its label,
 * detail, group and section together hold every word; a group whose own title,
 * hint or keywords match keeps all its rows. `extraGroups` adds hits a section
 * computes itself, such as the shortcut list.
 *
 * @example
 * searchSettingsRows(sections, (id) => SETTINGS_SEARCH_GROUPS[id], "tree guides");
 * // [{ section: appearance, groups: [{ id: "sidebar", rows: [Show tree guides] }], count: 1 }]
 */
export function searchSettingsRows<T extends SearchableSettingsSection>(
  sections: readonly T[],
  groupsOf: (section: T) => readonly SettingsSearchGroup[],
  query: string,
  extraGroups: (section: T) => readonly SettingsGroupHit[] = () => [],
): SettingsSectionHit<T>[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  const hits: SettingsSectionHit<T>[] = [];
  for (const section of sections) {
    const groups = [
      ...groupsOf(section).flatMap((group) => groupHit(section, group, tokens) ?? []),
      ...extraGroups(section),
    ];
    if (groups.length === 0) {
      continue;
    }
    const count = groups.reduce((total, group) => total + Math.max(1, group.rows.length), 0);
    hits.push({ section, groups, count });
  }
  return hits;
}

/**
 * @name shortcutGroupId
 * @description The settings group id for one shortcut category, shared by the
 * shortcuts page and the search that addresses its groups.
 *
 * @example
 * shortcutGroupId("Editor search"); // "shortcuts-editor-search"
 */
export function shortcutGroupId(group: string): string {
  return `shortcuts-${group.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/**
 * @name ledgerSearchMatch
 * @description Turns one section's search hit into what its groups and rows
 * read while rendering results: each matched group id, with the labels of the
 * matched rows, or null when the whole group matched.
 *
 * @example
 * ledgerSearchMatch(hit).get("sidebar"); // Set { "Show tree guides" }
 */
export function ledgerSearchMatch(
  groups: readonly SettingsGroupHit[],
): ReadonlyMap<string, ReadonlySet<string> | null> {
  return new Map(
    groups.map((group) => [
      group.id,
      group.wholeGroup ? null : new Set(group.rows.map((row) => row.label)),
    ]),
  );
}

/**
 * @name keywordOnlySections
 * @description Sections the query names through their keywords or copy while
 * none of their indexed rows matched, so search can still offer to open them.
 * Words must match from their start, as rows do.
 *
 * @example
 * keywordOnlySections(sections, hits, "github"); // [about]
 */
export function keywordOnlySections<T extends SearchableSettingsSection>(
  sections: readonly T[],
  hits: readonly SettingsSectionHit<T>[],
  query: string,
): T[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  const hitIds = new Set(hits.map((hit) => hit.section.id));
  return filterSettingsSections(sections, query).filter(
    (section) => !hitIds.has(section.id) && containsEvery(sectionHaystack(section), tokens),
  );
}
