import { expect, test } from "vitest";
import {
  findBareDomain,
  isBareDomain,
  matchBareDomain,
  trimUrlPunctuation,
} from "@skriuw/shared/helpers/bare-domain";

test("accepts domains with a known top-level domain, with ports and paths", () => {
  for (const text of [
    "skriuw.com",
    "storybook.regeljelease.dev",
    "skriuw.com/docs",
    "www.example.com",
    "example.nl:8080/a?b=c#d",
    "en.wikipedia.org/wiki/Foo_(bar)",
  ]) {
    expect(isBareDomain(text), text).toBe(true);
  }
});

test("rejects filenames, versions, abbreviations, and unknown or uppercase top-level domains", () => {
  for (const text of [
    "gen-css.mjs",
    "package.json",
    "Node.js",
    "v1.2.3",
    "e.g.",
    "README.md",
    "main.rs",
    "Object.is",
    "import.meta.env.DEV",
    "skriuw.zip",
    "localhost",
    "-skriuw.com",
  ]) {
    expect(isBareDomain(text), text).toBe(false);
  }
});

test("leaves trailing sentence punctuation out of the match", () => {
  expect(findBareDomain("see skriuw.com.")).toEqual({ start: 4, end: 14 });
  expect(findBareDomain("(skriuw.com/docs), next")).toEqual({ start: 1, end: 16 });
  expect(findBareDomain("ask skriuw.com: it works")).toEqual({ start: 4, end: 14 });
  expect(findBareDomain("seen skriuw.com?")).toEqual({ start: 5, end: 15 });
});

test("skips domains that belong to an email, path, tag, or longer word", () => {
  for (const text of [
    "mail bob@example.com",
    "open src/skriuw.com",
    "tag #skriuw.com",
    "note [[skriuw.com]]",
    "skriuw.com_draft",
    "skriuw.com@team",
  ]) {
    expect(findBareDomain(text), text).toBeNull();
  }
});

test("reads from a given index and respects the character before it", () => {
  expect(matchBareDomain("go skriuw.com now", 3)).toBe(13);
  expect(matchBareDomain("goskriuw.com", 2)).toBe(-1);
});

test("keeps balanced parentheses and drops unbalanced ones", () => {
  expect(trimUrlPunctuation("skriuw.com/docs).")).toBe("skriuw.com/docs");
  expect(trimUrlPunctuation("en.wikipedia.org/wiki/Foo_(bar)")).toBe(
    "en.wikipedia.org/wiki/Foo_(bar)",
  );
});
