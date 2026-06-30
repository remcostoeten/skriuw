/**
 * Pure, ProseMirror-free string helpers for the vim plugin: word motions,
 * find-char, and text-object boundary resolution. Kept dependency-free so the
 * grammar is fast to unit-test in isolation. Offsets are 0-based indices into a
 * single block's plain text (a "line" in BlockNote terms).
 */

export const CHAR_SPACE = 0;
export const CHAR_WORD = 1;
export const CHAR_PUNCT = 2;

const WORD_RE = /[\p{L}\p{N}_]/u;
const SPACE_RE = /\s/;

/**
 * Vim character class for a single char. With `big` (WORD motions) every
 * non-blank char is the same class; otherwise letters/digits/underscore are
 * `word` and other visible chars are `punct`.
 */
export function charClass(char: string | undefined, big = false): number {
	if (!char || SPACE_RE.test(char)) return CHAR_SPACE;
	if (big) return CHAR_WORD;
	return WORD_RE.test(char) ? CHAR_WORD : CHAR_PUNCT;
}

export function isWordChar(char: string | undefined): boolean {
	return charClass(char) === CHAR_WORD;
}

/** `~`/`g~` — flip the case of every character in `text`. */
export function swapCase(text: string): string {
	return text
		.split("")
		.map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
		.join("");
}

/** `w` — start of the next word (or WORD when `big`). */
export function nextWordStart(text: string, from: number, big = false): number {
	const len = text.length;
	let i = from;
	if (i >= len) return len;
	const cls = charClass(text[i], big);
	if (cls !== CHAR_SPACE) {
		while (i < len && charClass(text[i], big) === cls) i += 1;
	}
	while (i < len && charClass(text[i], big) === CHAR_SPACE) i += 1;
	return i;
}

/** `b` — start of the previous word. */
export function prevWordStart(text: string, from: number, big = false): number {
	let i = from - 1;
	while (i > 0 && charClass(text[i], big) === CHAR_SPACE) i -= 1;
	if (i <= 0) return 0;
	const cls = charClass(text[i], big);
	while (i > 0 && charClass(text[i - 1], big) === cls) i -= 1;
	return Math.max(0, i);
}

/** `e` — end of the current/next word (index of its last char). */
export function wordEnd(text: string, from: number, big = false): number {
	const len = text.length;
	let i = from + 1;
	while (i < len && charClass(text[i], big) === CHAR_SPACE) i += 1;
	if (i >= len) return Math.min(len - 1, Math.max(from, 0));
	const cls = charClass(text[i], big);
	while (i + 1 < len && charClass(text[i + 1], big) === cls) i += 1;
	return i;
}

/**
 * `f`/`F`/`t`/`T` — offset of the find target relative to the line, or null if
 * the char isn't found `count` times in the search direction. On `repeat`
 * (`;`/`,`) the cursor of a till-motion sits adjacent to the previous target,
 * so the search start is nudged past it; without this `;` re-finds the same
 * char and never advances.
 */
export function findCharOffset(
	text: string,
	from: number,
	find: "f" | "F" | "t" | "T",
	char: string,
	count: number,
	repeat = false,
): number | null {
	const forward = find === "f" || find === "t";
	const till = find === "t" || find === "T";
	let index = repeat && till ? (forward ? from + 1 : from - 1) : from;
	for (let n = 0; n < count; n += 1) {
		if (forward) {
			const found = text.indexOf(char, index + 1);
			if (found === -1) return null;
			index = found;
		} else {
			const found = text.lastIndexOf(char, index - 1);
			if (found === -1) return null;
			index = found;
		}
	}
	if (find === "t") return index - 1;
	if (find === "T") return index + 1;
	return index;
}

/** `iw`/`aw` — the run of same-class chars around `offset` (plus trailing space for `aw`). */
export function wordObjectBounds(
	text: string,
	offset: number,
	around: boolean,
): { s: number; e: number } {
	const at = Math.min(Math.max(offset, 0), Math.max(0, text.length - 1));
	const cls = charClass(text[at]);
	let s = at;
	let e = at;
	while (s > 0 && charClass(text[s - 1]) === cls) s -= 1;
	while (e < text.length && charClass(text[e]) === cls) e += 1;
	if (around) {
		while (e < text.length && charClass(text[e]) === CHAR_SPACE) e += 1;
	}
	return { s, e };
}

export const PAIRS: Record<string, { open: string; close: string }> = {
	'"': { open: '"', close: '"' },
	"'": { open: "'", close: "'" },
	"`": { open: "`", close: "`" },
	"(": { open: "(", close: ")" },
	")": { open: "(", close: ")" },
	b: { open: "(", close: ")" },
	"[": { open: "[", close: "]" },
	"]": { open: "[", close: "]" },
	"{": { open: "{", close: "}" },
	"}": { open: "{", close: "}" },
	B: { open: "{", close: "}" },
};

/**
 * `i(`/`a"`/... — boundaries of the pair enclosing `offset`. `around` includes
 * the delimiters. Returns null when there is no enclosing pair.
 */
export function pairObjectBounds(
	text: string,
	offset: number,
	open: string,
	close: string,
	around: boolean,
): { s: number; e: number } | null {
	if (open === close) {
		const positions: number[] = [];
		for (let i = 0; i < text.length; i += 1) if (text[i] === open) positions.push(i);
		for (let p = 0; p + 1 < positions.length; p += 2) {
			const a = positions[p]!;
			const b = positions[p + 1]!;
			if (offset >= a && offset <= b) {
				return around ? { s: a, e: b + 1 } : { s: a + 1, e: b };
			}
		}
		return null;
	}
	let openIdx = -1;
	let depth = 0;
	for (let i = offset; i >= 0; i -= 1) {
		if (text[i] === close && i !== offset) depth += 1;
		else if (text[i] === open) {
			if (depth === 0) {
				openIdx = i;
				break;
			}
			depth -= 1;
		}
	}
	if (openIdx === -1) return null;
	depth = 0;
	for (let i = openIdx + 1; i < text.length; i += 1) {
		if (text[i] === open) depth += 1;
		else if (text[i] === close) {
			if (depth === 0) return around ? { s: openIdx, e: i + 1 } : { s: openIdx + 1, e: i };
			depth -= 1;
		}
	}
	return null;
}
