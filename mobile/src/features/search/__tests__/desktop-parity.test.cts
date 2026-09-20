import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import test from "node:test";
import { parseSearchQuery as parseOnDesktop } from "../../../../../app/src/features/search/query-parser";
import { parseSearchQuery } from "../query/query-parser";

const featureDir = resolve(__dirname, "..");
const desktopDir = resolve(__dirname, "../../../../../app/src/features/search");

const SHARED_IMPORTS: readonly [RegExp, string][] = [
  [/"@skriuw\/renderer-core\/([^"]+)"/g, '"@shared/$1"'],
  [/"\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/shared\/renderer-core\/src\/([^"]+)"/g, '"@shared/$1"'],
];

function comparable(source: string): string {
  let text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [pattern, replacement] of SHARED_IMPORTS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}

const COPIED_MODULES = [
  "query/query-parser.ts",
  "query/filter-resolution.ts",
  "query/search-plan.ts",
  "results/snippet.ts",
];

for (const module of COPIED_MODULES) {
  test(`${module} has not drifted from the desktop original`, () => {
    const mobile = comparable(readFileSync(resolve(featureDir, module), "utf8"));
    const desktop = comparable(readFileSync(resolve(desktopDir, basename(module)), "utf8"));
    assert.equal(
      mobile,
      desktop,
      `${module} differs from app/src/features/search/${basename(module)}; copy the change across or extract both into shared/renderer-core.`,
    );
  });
}

const QUERIES: readonly string[] = [
  "",
  "   ",
  "plain text",
  "#tag",
  "$person",
  "tag:design",
  "TAG:Design",
  "person:ada",
  'Person:"Ada Lovelace"',
  '#"design system" tokens',
  "#",
  "tag:",
  '#"unterminated',
  "\\#literal",
  "\\$escaped",
  "#dup #DUP",
  "#café #café",
  "mixed #tag $person text tag:other",
  "trailing\\",
  '"quoted free text"',
];

test("both parsers read every query in the corpus the same way", () => {
  for (const query of QUERIES) {
    assert.deepEqual(
      parseSearchQuery(query),
      parseOnDesktop(query),
      `parsers disagree about ${JSON.stringify(query)}`,
    );
  }
});
