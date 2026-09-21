import assert from "node:assert/strict";
import test from "node:test";
import type { MarkdownTree } from "../../../../src/features/transfer/export/markdown-transfer-model";
import { detectImportSource } from "../../../../src/features/transfer/import/model";
import { importSources } from "../../../../src/features/transfer/import/sources";
import { notionSource } from "../../../../src/features/transfer/import/sources/notion";

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
  assert.ok(
    bundle.warnings.some((warning) =>
      warning.message.includes("source link"),
    ),
  );
});

test("database CSV rows become notes with typed properties", () => {
  const bundle = notionSource.parse(
    tree({
      files: [
        {
          relativePath: "Tasks 0123456789abcdef0123456789abcdef.csv",
          content: [
            "Name,Done,Estimate,Due,Source,Status",
            'Ship importer,true,3.5,2026-08-01,https://example.com,"In progress"',
            "Ship importer,false,5,2026-08-02,https://example.org,Done",
          ].join("\n"),
        },
      ],
    }),
  );
  assert.deepEqual(
    bundle.notes.map((note) => note.relativePath),
    ["Tasks/Ship importer.md", "Tasks/Ship importer (2).md"],
  );
  assert.deepEqual(bundle.notes[0].properties, [
    { name: "Done", value: { type: "checkbox", value: true } },
    { name: "Estimate", value: { type: "number", value: 3.5 } },
    { name: "Due", value: { type: "date", value: "2026-08-01" } },
    {
      name: "Source",
      value: { type: "url", value: "https://example.com" },
    },
    { name: "Status", value: { type: "text", value: "In progress" } },
  ]);
  assert.deepEqual(bundle.directories, ["Tasks"]);
});

test("standalone UUID-suffixed CSV detects as Notion", () => {
  const input = tree({
    files: [
      {
        relativePath: "Tasks 0123456789abcdef0123456789abcdef.csv",
        content: "Name\nTask",
      },
    ],
  });
  assert.equal(notionSource.detect(input), 0.85);
  assert.equal(detectImportSource(importSources, input)?.id, "notion");
});

test("malformed database CSV is named in diagnostics", () => {
  const bundle = notionSource.parse(
    tree({
      files: [
        {
          relativePath: "Tasks 0123456789abcdef0123456789abcdef.csv",
          content: 'Name,Status\n"unfinished',
        },
      ],
    }),
  );
  assert.equal(bundle.notes.length, 0);
  assert.deepEqual(bundle.warnings, [
    {
      path: "Tasks 0123456789abcdef0123456789abcdef.csv",
      message: "Database CSV is malformed and was skipped",
      severity: "error",
    },
  ]);
});
