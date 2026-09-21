import assert from "node:assert/strict";
import test from "node:test";
import {
  OBJECT_CHARACTER,
  bracketObject,
  findCharacter,
  firstNonBlank,
  matchingBracket,
  nextWordStart,
  numberAtOrAfter,
  previousWordEnd,
  previousWordStart,
  quoteObject,
  swapCase,
  wordEnd,
  wordObject,
  wordUnderCursor,
} from "../../../../src/features/editor/vim/vim-text";

test("word motions stop at word starts, ends, and punctuation", () => {
  const text = "foo.bar  baz_qux";
  assert.equal(nextWordStart(text, 0), 3);
  assert.equal(nextWordStart(text, 3), 4);
  assert.equal(nextWordStart(text, 4), 9);
  assert.equal(nextWordStart(text, 9), null);
  assert.equal(nextWordStart(text, 0, true), 9);
  assert.equal(wordEnd(text, 0), 2);
  assert.equal(wordEnd(text, 2), 3);
  assert.equal(wordEnd(text, 4), 6);
  assert.equal(wordEnd(text, 9), 15);
  assert.equal(wordEnd(text, 15), null);
  assert.equal(previousWordStart(text, 15), 9);
  assert.equal(previousWordStart(text, 9), 4);
  assert.equal(previousWordStart(text, 4), 3);
  assert.equal(previousWordStart(text, 0), null);
  assert.equal(previousWordEnd(text, 9), 6);
  assert.equal(previousWordEnd(text, 4), 3);
  assert.equal(previousWordEnd(text, 0), null);
});

test("inline nodes count as their own one-character word", () => {
  const text = `see ${OBJECT_CHARACTER}tag now`;
  assert.equal(nextWordStart(text, 0), 4);
  assert.equal(nextWordStart(text, 4), 5);
  assert.equal(wordEnd(text, 0), 2);
  assert.equal(wordEnd(text, 2), 4);
  assert.deepEqual(wordObject(text, 4, false), { from: 4, to: 5 });
});

test("find motions honor counts and till stops short", () => {
  const text = "a-b-c-d";
  assert.equal(findCharacter(text, 0, "f", "-"), 1);
  assert.equal(findCharacter(text, 0, "f", "-", 2), 3);
  assert.equal(findCharacter(text, 0, "t", "-"), 0);
  assert.equal(findCharacter(text, 0, "t", "-", 2), 2);
  assert.equal(findCharacter(text, 6, "F", "-"), 5);
  assert.equal(findCharacter(text, 6, "T", "-"), 6);
  assert.equal(findCharacter(text, 6, "f", "-"), null);
});

test("text objects select words, quotes, and brackets on the line", () => {
  const text = 'call(foo, "bar baz") ok';
  assert.deepEqual(wordObject(text, 6, false), { from: 5, to: 8 });
  assert.deepEqual(wordObject(text, 6, true), { from: 5, to: 8 });
  assert.deepEqual(wordObject(text, 21, true), { from: 20, to: 23 });
  assert.deepEqual(quoteObject(text, 12, '"', false), { from: 11, to: 18 });
  assert.deepEqual(quoteObject(text, 12, '"', true), { from: 9, to: 19 });
  assert.deepEqual(quoteObject('a "b" c', 3, '"', true), { from: 2, to: 6 });
  assert.deepEqual(bracketObject(text, 12, "(", false), { from: 5, to: 19 });
  assert.deepEqual(bracketObject(text, 12, "(", true), { from: 4, to: 20 });
  assert.equal(bracketObject(text, 1, "(", false), null);
  assert.deepEqual(wordObject("a  b", 1, false), { from: 1, to: 3 });
});

test("bracket matching jumps both directions and skips nested pairs", () => {
  const text = "x (a (b) c) y";
  assert.equal(matchingBracket(text, 2), 10);
  assert.equal(matchingBracket(text, 10), 2);
  assert.equal(matchingBracket(text, 0), 10);
  assert.equal(matchingBracket(text, 12), null);
});

test("helpers: first non-blank, case swap, numbers, word under cursor", () => {
  assert.equal(firstNonBlank("   x"), 3);
  assert.equal(firstNonBlank("   "), 2);
  assert.equal(swapCase("aBc1"), "AbC1");
  assert.deepEqual(numberAtOrAfter("item 41 and -7", 0), { from: 5, to: 7, value: 41 });
  assert.deepEqual(numberAtOrAfter("item 41 and -7", 8), { from: 12, to: 14, value: -7 });
  assert.deepEqual(numberAtOrAfter("v-7", 0), { from: 2, to: 3, value: 7 });
  assert.equal(numberAtOrAfter("none", 0), null);
  assert.deepEqual(wordUnderCursor("hello world", 7), { from: 6, to: 11 });
  assert.deepEqual(wordUnderCursor("  hello", 0), { from: 2, to: 7 });
  assert.equal(wordUnderCursor("   ", 0), null);
});
