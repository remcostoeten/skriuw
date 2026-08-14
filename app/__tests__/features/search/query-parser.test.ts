import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeEntityName,
  parseSearchQuery,
} from "../../../src/features/search/query-parser";

test("sigils and keyword prefixes both produce entity filters", () => {
  const parsed = parseSearchQuery("#design $ada tag:launch person:Bob");
  assert.deepEqual(
    parsed.filters.map((filter) => `${filter.kind}/${filter.name}`),
    ["tag/design", "person/ada", "tag/launch", "person/Bob"],
  );
  assert.equal(parsed.text, "");
  assert.deepEqual(parsed.incomplete, []);
});

test("keyword prefixes are case-insensitive and keep the typed name intact", () => {
  const parsed = parseSearchQuery("TAG:Design Person:Ada");
  assert.deepEqual(
    parsed.filters.map((filter) => [filter.kind, filter.name, filter.key]),
    [
      ["tag", "Design", "design"],
      ["person", "Ada", "ada"],
    ],
  );
});

test("free text and filters combine in any order", () => {
  const parsed = parseSearchQuery("budget #design notes $ada");
  assert.deepEqual(parsed.terms, ["budget", "notes"]);
  assert.equal(parsed.text, "budget notes");
  assert.deepEqual(
    parsed.filters.map((filter) => filter.key),
    ["design", "ada"],
  );
});

test("quoted names carry whitespace and collapse internal runs", () => {
  const parsed = parseSearchQuery('#"design  system" tag:"q4   plan" rest');
  assert.deepEqual(
    parsed.filters.map((filter) => filter.name),
    ["design system", "q4 plan"],
  );
  assert.equal(parsed.text, "rest");
});

test("backslash escapes a sigil, a quote, and a space", () => {
  const parsed = parseSearchQuery('\\#literal #design\\ system \\$12 #say\\"hi\\"');
  assert.deepEqual(parsed.terms, ["#literal", "$12"]);
  assert.deepEqual(
    parsed.filters.map((filter) => filter.name),
    ["design system", 'say"hi"'],
  );
});

test("duplicate filters collapse by folded name and keep first-seen order", () => {
  const parsed = parseSearchQuery("#Design #design tag:DESIGN $ada #ops");
  assert.deepEqual(
    parsed.filters.map((filter) => [filter.kind, filter.name]),
    [
      ["tag", "Design"],
      ["person", "ada"],
      ["tag", "ops"],
    ],
  );
});

test("a tag and a person may share a name without colliding", () => {
  const parsed = parseSearchQuery("#ada $ada");
  assert.deepEqual(
    parsed.filters.map((filter) => filter.kind),
    ["tag", "person"],
  );
});

test("incomplete tokens are reported rather than guessed at", () => {
  const parsed = parseSearchQuery('# $ tag: person: #"open');
  assert.deepEqual(parsed.filters, []);
  assert.equal(parsed.text, "");
  assert.deepEqual(
    parsed.incomplete.map((entry) => [entry.kind, entry.raw]),
    [
      ["tag", "#"],
      ["person", "$"],
      ["tag", "tag:"],
      ["person", "person:"],
      ["tag", '#"open'],
    ],
  );
});

test("parsing is total and empty input is inert", () => {
  for (const input of ["", "   ", '"', "\\", "###", "$$$", ":", "tag:", "#\\"]) {
    const parsed = parseSearchQuery(input);
    assert.equal(typeof parsed.text, "string");
    assert.ok(Array.isArray(parsed.filters));
  }
  assert.deepEqual(parseSearchQuery("   "), {
    text: "",
    terms: [],
    filters: [],
    incomplete: [],
  });
});

test("names fold across case, Unicode composition, and surrounding whitespace", () => {
  const composed = normalizeEntityName("Café");
  const decomposed = normalizeEntityName("  café  ");
  assert.equal(composed, decomposed);
  assert.equal(normalizeEntityName("ÉCOLE"), "école");
  const parsed = parseSearchQuery('#Café #"café"');
  assert.equal(parsed.filters.length, 1, "composition-equal names are one filter");
});

test("a colon inside free text is not mistaken for an operator", () => {
  const parsed = parseSearchQuery("note:taking https://example.com");
  assert.deepEqual(parsed.terms, ["note:taking", "https://example.com"]);
  assert.deepEqual(parsed.filters, []);
});
