export type JumpMatch = {
  score: number;
  /** Indices in the title of the matched characters, ascending. */
  indices: readonly number[];
};

function wordStarts(title: string): boolean[] {
  return [...title].map((char, index) => {
    if (index === 0) return true;
    const previous = title[index - 1]!;
    if (!/[\p{L}\p{N}]/u.test(previous)) return true;
    return /\p{Lu}/u.test(char) && /\p{Ll}/u.test(previous);
  });
}

/**
 * Fuzzy match: every query character must appear in order. Matches at word starts
 * (including camelCase humps) and consecutive runs score higher, so "inlco" prefers
 * InlineConfirm over InlineEdit and "dr" prefers DropdownMenu.
 */
export function jumpMatch(title: string, query: string): JumpMatch | null {
  if (!query) return null;
  const text = title.toLowerCase();
  const starts = wordStarts(title);
  const memo = new Map<string, JumpMatch | null>();

  function best(textIndex: number, queryIndex: number, previous: number): JumpMatch | null {
    if (queryIndex === query.length) return { score: 0, indices: [] };
    const key = `${textIndex}:${queryIndex}:${previous}`;
    if (memo.has(key)) return memo.get(key)!;
    let result: JumpMatch | null = null;
    for (let index = textIndex; index < text.length; index++) {
      if (text[index] !== query[queryIndex]) continue;
      const rest = best(index + 1, queryIndex + 1, index);
      if (!rest) continue;
      const consecutive = previous >= 0 && index === previous + 1;
      const gap = previous >= 0 ? index - previous - 1 : index;
      const score =
        1 +
        (starts[index] ? 8 : 0) +
        (consecutive ? 5 : 0) +
        (index === 0 ? 4 : 0) -
        gap * 0.2 +
        rest.score;
      if (!result || score > result.score) result = { score, indices: [index, ...rest.indices] };
    }
    memo.set(key, result);
    return result;
  }

  return best(0, 0, -1);
}

/** Items matching `query`, best score first, sidebar order on ties. */
export function jumpMatches<T extends { title: string }>(items: readonly T[], query: string): T[] {
  return items
    .map((item, order) => ({ item, order, match: jumpMatch(item.title, query) }))
    .filter((entry) => entry.match !== null)
    .sort((left, right) => right.match!.score - left.match!.score || left.order - right.order)
    .map((entry) => entry.item);
}
