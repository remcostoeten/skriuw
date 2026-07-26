import assert from "node:assert/strict";
import test from "node:test";
import type { MarkdownTree } from "../../src/export/markdown-transfer-model";
import { detectImportSource } from "../../src/import/model";
import { importSources } from "../../src/import/sources";
import { notionSource } from "../../src/import/sources/notion";

const UUID = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";

function tree(partial: Partial<MarkdownTree>): MarkdownTree {
  return { directories: [], files: [], assets: [], skipped: 0, ...partial };
}

test("uuid-suffixed markdown files detect as notion above obsidian and markdown", () => {
  const source = detectImportSource(
    importSources,
    tree({
      files: [
        {
          relativePath: `My Page ${UUID}.md`,
          content: "# My Page\n\nSee [[something]]",
        },
      ],
    }),
  );
  assert.equal(source?.id, "notion");
});

test("markdown without uuid suffixes does not detect as notion", () => {
  assert.equal(
    notionSource.detect(tree({ files: [{ relativePath: "Note.md", content: "text" }] })),
    0,
  );
});

test("dashed uuid suffixes also detect", () => {
  assert.ok(
    notionSource.detect(
      tree({
        files: [
          {
            relativePath: "Page 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.md",
            content: "x",
          },
        ],
      }),
    ) > 0,
  );
});

test("uuid suffixes are stripped from paths, titles, and directories", () => {
  const bundle = notionSource.parse(
    tree({
      directories: [`Projects ${UUID}`],
      files: [
        { relativePath: `Projects ${UUID}/Roadmap ${UUID}.md`, content: "body" },
        { relativePath: `Home ${UUID}.md`, content: "body" },
      ],
    }),
  );
  assert.deepEqual(
    bundle.notes.map((note) => note.relativePath).sort(),
    ["Home.md", "Projects/Roadmap.md"],
  );
  assert.deepEqual(bundle.directories, ["Projects"]);
  assert.equal(bundle.notes.find((note) => note.relativePath === "Home.md")?.title, "Home");
});

test("stripped-name collisions dedupe with counters", () => {
  const bundle = notionSource.parse(
    tree({
      files: [
        { relativePath: `Page ${UUID}.md`, content: "one" },
        { relativePath: "Page 9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c.md", content: "two" },
      ],
    }),
  );
  assert.deepEqual(
    bundle.notes.map((note) => note.relativePath).sort(),
    ["Page (2).md", "Page.md"],
  );
});

test("the duplicated leading H1 title is stripped from the body", () => {
  const bundle = notionSource.parse(
    tree({
      files: [
        { relativePath: `My Page ${UUID}.md`, content: "# My Page\n\nActual body" },
        { relativePath: `Other ${UUID}.md`, content: "# Different Heading\n\nBody" },
      ],
    }),
  );
  assert.equal(
    bundle.notes.find((note) => note.title === "My Page")?.markdown,
    "Actual body",
  );
  assert.equal(
    bundle.notes.find((note) => note.title === "Other")?.markdown,
    "# Different Heading\n\nBody",
  );
});

test("internal page links become wikilinks; external links stay", () => {
  const bundle = notionSource.parse(
    tree({
      directories: [`Area ${UUID}`],
      files: [
        {
          relativePath: `Home ${UUID}.md`,
          content: `Go to [Roadmap](Area%20${UUID}/Roadmap%20${UUID}.md#section) or [site](https://example.com)`,
        },
        { relativePath: `Area ${UUID}/Roadmap ${UUID}.md`, content: "body" },
      ],
    }),
  );
  assert.equal(
    bundle.notes.find((note) => note.title === "Home")?.markdown,
    "Go to [[Roadmap]] or [site](https://example.com)",
  );
});

test("image links are rewritten to resolve from the renamed note path", () => {
  const bundle = notionSource.parse(
    tree({
      directories: [`My Page ${UUID}`],
      assets: [`My Page ${UUID}/chart 1.png`],
      files: [
        {
          relativePath: `My Page ${UUID}.md`,
          content: `![chart](My%20Page%20${UUID}/chart%201.png)`,
        },
      ],
    }),
  );
  assert.equal(
    bundle.notes[0].markdown,
    `![chart](My%20Page%20${UUID}/chart%201.png)`,
  );
});

test("nested note image links climb out of renamed directories", () => {
  const bundle = notionSource.parse(
    tree({
      directories: [`Area ${UUID}`, `Area ${UUID}/Sub ${UUID}`],
      assets: [`Area ${UUID}/Sub ${UUID}/pic.png`],
      files: [
        {
          relativePath: `Area ${UUID}/Note ${UUID}.md`,
          content: `![p](Sub%20${UUID}/pic.png)`,
        },
      ],
    }),
  );
  assert.equal(
    bundle.notes[0].markdown,
    `![p](../Area%20${UUID}/Sub%20${UUID}/pic.png)`,
  );
});

test("links to database csv files stay and produce a warning", () => {
  const bundle = notionSource.parse(
    tree({
      files: [
        {
          relativePath: `Home ${UUID}.md`,
          content: `[Tasks](Tasks%20${UUID}.csv)`,
        },
      ],
    }),
  );
  assert.equal(bundle.notes[0].markdown, `[Tasks](Tasks%20${UUID}.csv)`);
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("databases are not imported")));
});
