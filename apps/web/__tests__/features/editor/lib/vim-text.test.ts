import { describe, expect, test } from "bun:test";
import {
	charClass,
	CHAR_PUNCT,
	CHAR_SPACE,
	CHAR_WORD,
	findCharOffset,
	nextWordStart,
	pairObjectBounds,
	prevWordStart,
	swapCase,
	wordEnd,
	wordObjectBounds,
} from "@/features/editor/lib/vim-text";

describe("charClass", () => {
	test("classifies space, word, and punctuation", () => {
		expect(charClass(" ")).toBe(CHAR_SPACE);
		expect(charClass("\t")).toBe(CHAR_SPACE);
		expect(charClass("a")).toBe(CHAR_WORD);
		expect(charClass("Z")).toBe(CHAR_WORD);
		expect(charClass("5")).toBe(CHAR_WORD);
		expect(charClass("_")).toBe(CHAR_WORD);
		expect(charClass(".")).toBe(CHAR_PUNCT);
		expect(charClass("(")).toBe(CHAR_PUNCT);
		expect(charClass(undefined)).toBe(CHAR_SPACE);
	});

	test("big (WORD) treats every non-blank the same", () => {
		expect(charClass(".", true)).toBe(CHAR_WORD);
		expect(charClass("a", true)).toBe(CHAR_WORD);
		expect(charClass(" ", true)).toBe(CHAR_SPACE);
	});
});

describe("swapCase (~)", () => {
	test("flips case and leaves non-cased chars untouched", () => {
		expect(swapCase("Hello, World 42")).toBe("hELLO, wORLD 42");
		expect(swapCase("")).toBe("");
	});
});

describe("nextWordStart (w)", () => {
	test("moves to start of next word", () => {
		expect(nextWordStart("hello world", 0)).toBe(6);
	});

	test("stops at punctuation as its own word", () => {
		expect(nextWordStart("foo.bar", 0)).toBe(3);
		expect(nextWordStart("foo.bar", 3)).toBe(4);
	});

	test("skips runs of whitespace", () => {
		expect(nextWordStart("a    b", 0)).toBe(5);
	});

	test("clamps at end of line", () => {
		expect(nextWordStart("word", 0)).toBe(4);
		expect(nextWordStart("word", 4)).toBe(4);
	});

	test("WORD motion ignores punctuation boundaries", () => {
		expect(nextWordStart("foo.bar baz", 0, true)).toBe(8);
	});
});

describe("prevWordStart (b)", () => {
	test("moves back to start of previous word", () => {
		expect(prevWordStart("hello world", 6)).toBe(0);
	});

	test("treats punctuation as a separate word", () => {
		expect(prevWordStart("foo.bar", 4)).toBe(3);
		expect(prevWordStart("foo.bar", 3)).toBe(0);
	});

	test("clamps at start", () => {
		expect(prevWordStart("hello", 0)).toBe(0);
	});
});

describe("wordEnd (e)", () => {
	test("moves to last char of current word", () => {
		expect(wordEnd("hello world", 0)).toBe(4);
	});

	test("jumps to end of next word when already at an end", () => {
		expect(wordEnd("hello world", 4)).toBe(10);
	});

	test("handles punctuation runs", () => {
		expect(wordEnd("a.. b", 0)).toBe(2);
	});
});

describe("findCharOffset (f/F/t/T)", () => {
	const text = "abcabc";
	test("f finds forward inclusive", () => {
		expect(findCharOffset(text, 0, "f", "c", 1)).toBe(2);
		expect(findCharOffset(text, 0, "f", "c", 2)).toBe(5);
	});

	test("t stops one before the target", () => {
		expect(findCharOffset(text, 0, "t", "c", 1)).toBe(1);
	});

	test("F finds backward", () => {
		expect(findCharOffset(text, 5, "F", "a", 1)).toBe(3);
		expect(findCharOffset(text, 5, "F", "a", 2)).toBe(0);
	});

	test("T stops one after the backward target", () => {
		expect(findCharOffset(text, 5, "T", "a", 1)).toBe(4);
	});

	test("returns null when not found enough times", () => {
		expect(findCharOffset(text, 0, "f", "z", 1)).toBeNull();
		expect(findCharOffset(text, 0, "f", "c", 3)).toBeNull();
	});

	test("t repeat advances past the adjacent target", () => {
		const line = "a.b.c";
		expect(findCharOffset(line, 0, "t", ".", 1)).toBe(0);
		expect(findCharOffset(line, 0, "t", ".", 1, true)).toBe(2);
		expect(findCharOffset(line, 2, "t", ".", 1, true)).toBeNull();
	});

	test("T repeat advances past the adjacent backward target", () => {
		const line = "a.b.c";
		expect(findCharOffset(line, 4, "T", ".", 1)).toBe(4);
		expect(findCharOffset(line, 4, "T", ".", 1, true)).toBe(2);
	});
});

describe("wordObjectBounds (iw/aw)", () => {
	test("inner word selects the word run", () => {
		expect(wordObjectBounds("hello world", 2, false)).toEqual({ s: 0, e: 5 });
	});

	test("around word includes trailing whitespace", () => {
		expect(wordObjectBounds("hello world", 2, true)).toEqual({ s: 0, e: 6 });
	});

	test("works on a punctuation run", () => {
		expect(wordObjectBounds("a..b", 1, false)).toEqual({ s: 1, e: 3 });
	});
});

describe("pairObjectBounds (i(/a\"/...)", () => {
	test("inner parentheses excludes delimiters", () => {
		expect(pairObjectBounds("a(bc)d", 3, "(", ")", false)).toEqual({ s: 2, e: 4 });
	});

	test("around parentheses includes delimiters", () => {
		expect(pairObjectBounds("a(bc)d", 3, "(", ")", true)).toEqual({ s: 1, e: 5 });
	});

	test("nested parentheses resolves the enclosing pair", () => {
		// cursor on the inner 'x' of a(b(x)c)
		expect(pairObjectBounds("a(b(x)c)", 4, "(", ")", false)).toEqual({ s: 4, e: 5 });
	});

	test("quotes resolve the surrounding pair", () => {
		expect(pairObjectBounds('say "hi" now', 6, '"', '"', false)).toEqual({ s: 5, e: 7 });
		expect(pairObjectBounds('say "hi" now', 6, '"', '"', true)).toEqual({ s: 4, e: 8 });
	});

	test("returns null without an enclosing pair", () => {
		expect(pairObjectBounds("no pairs here", 3, "(", ")", false)).toBeNull();
	});
});
