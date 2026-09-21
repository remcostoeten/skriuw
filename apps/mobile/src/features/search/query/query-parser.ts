/* Copy of apps/workspace/src/features/search/query-parser.ts, held identical by __tests__/desktop-parity.test.cts. */

export type SearchFilterKind = "tag" | "person";

export type SearchFilter = {
  kind: SearchFilterKind;
  name: string;
  key: string;
};

export type IncompleteSearchFilter = {
  kind: SearchFilterKind;
  raw: string;
};

export type ParsedSearchQuery = {
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
