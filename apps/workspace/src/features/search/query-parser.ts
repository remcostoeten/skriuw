/**
 * Search query grammar shared by every workspace search surface.
 *
 * A query is a whitespace-separated list of tokens. A token is an entity
 * filter when it starts with a sigil (`#` for tags, `$` for people) or a
 * keyword prefix (`tag:`, `person:`, case-insensitive); every other token is
 * free text. Names may be quoted (`#"design system"`) and any character can be
 * escaped with a backslash, so `\#literal` searches for the text `#literal`.
 *
 * The parser is pure and total: it never throws and every input maps to one
 * deterministic result. Tokens that name nothing yet (a lone `#`, a dangling
 * `tag:`, an unterminated quote) are reported as `incomplete` rather than
 * guessed at, so a surface can keep typing fluid without inventing a filter.
 */

export type SearchFilterKind = "tag" | "person";

export type SearchFilter = {
  kind: SearchFilterKind;
  /** Name as typed, with quotes and escapes removed and whitespace collapsed. */
  name: string;
  /** Case- and Unicode-folded form used for resolution and de-duplication. */
  key: string;
};

export type IncompleteSearchFilter = {
  kind: SearchFilterKind;
  /** The raw token, so a surface can echo exactly what the user typed. */
  raw: string;
};

export type ParsedSearchQuery = {
  /** Free-text terms joined by a single space; empty for a filter-only query. */
  text: string;
  terms: readonly string[];
  filters: readonly SearchFilter[];
  incomplete: readonly IncompleteSearchFilter[];
};

const SIGILS: ReadonlyMap<string, SearchFilterKind> = new Map([
  ["#", "tag"],
  ["$", "person"],
]);

const KEYWORD_PREFIXES: readonly { prefix: string; kind: SearchFilterKind }[] = [
  { prefix: "tag:", kind: "tag" },
  { prefix: "person:", kind: "person" },
];

const WHITESPACE = /\s/;

/**
 * Folds a tag or person name to the key used for lookup and de-duplication.
 * NFC keeps decomposed and precomposed accents equal; `toLowerCase` (not the
 * locale-aware variant) keeps the fold identical on every machine.
 */
export function normalizeEntityName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

type ReadValue = {
  value: string;
  next: number;
  unterminated: boolean;
};

function readValue(input: string, start: number): ReadValue {
  let index = start;
  let value = "";
  if (input[index] === '"') {
    index += 1;
    while (index < input.length) {
      const char = input[index] ?? "";
      if (char === "\\" && index + 1 < input.length) {
        value += input[index + 1];
        index += 2;
        continue;
      }
      if (char === '"') {
        return { value, next: index + 1, unterminated: false };
      }
      value += char;
      index += 1;
    }
    return { value, next: index, unterminated: true };
  }
  while (index < input.length) {
    const char = input[index] ?? "";
    if (char === "\\" && index + 1 < input.length) {
      value += input[index + 1];
      index += 2;
      continue;
    }
    if (WHITESPACE.test(char)) {
      break;
    }
    value += char;
    index += 1;
  }
  return { value, next: index, unterminated: false };
}

function filterStart(input: string, index: number): { kind: SearchFilterKind; valueStart: number } | null {
  const sigil = SIGILS.get(input[index] ?? "");
  if (sigil) {
    return { kind: sigil, valueStart: index + 1 };
  }
  const lower = input.slice(index).toLowerCase();
  for (const keyword of KEYWORD_PREFIXES) {
    if (lower.startsWith(keyword.prefix)) {
      return { kind: keyword.kind, valueStart: index + keyword.prefix.length };
    }
  }
  return null;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const terms: string[] = [];
  const filters: SearchFilter[] = [];
  const incomplete: IncompleteSearchFilter[] = [];
  const seen = new Set<string>();
  let index = 0;

  while (index < raw.length) {
    if (WHITESPACE.test(raw[index] ?? "")) {
      index += 1;
      continue;
    }
    const start = index;
    const operator = filterStart(raw, index);
    if (!operator) {
      const term = readValue(raw, index);
      index = term.next > index ? term.next : index + 1;
      if (term.value.length > 0) {
        terms.push(term.value);
      }
      continue;
    }
    const parsed = readValue(raw, operator.valueStart);
    index = parsed.next;
    const name = parsed.value.trim().replace(/\s+/g, " ");
    if (parsed.unterminated || name.length === 0) {
      incomplete.push({ kind: operator.kind, raw: raw.slice(start, parsed.next) });
      continue;
    }
    const key = normalizeEntityName(name);
    const dedupe = `${operator.kind}:${key}`;
    if (seen.has(dedupe)) {
      continue;
    }
    seen.add(dedupe);
    filters.push({ kind: operator.kind, name, key });
  }

  return { text: terms.join(" "), terms, filters, incomplete };
}
