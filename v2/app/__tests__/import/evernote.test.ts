import assert from "node:assert/strict";
import test from "node:test";
import type { MarkdownTree } from "../../src/export/markdown-transfer-model";
import { detectImportSource } from "../../src/import/model";
import { importSources } from "../../src/import/sources";
import { enmlToMarkdown } from "../../src/import/sources/enml-to-markdown";
import {
  evernoteSource,
  evernoteTimestampToMillis,
} from "../../src/import/sources/evernote";

function tree(partial: Partial<MarkdownTree>): MarkdownTree {
  return { directories: [], files: [], skipped: 0, ...partial };
}

function enex(notes: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<en-export export-date="20260101T120000Z" application="Evernote" version="10.0">${notes}</en-export>`;
}

function noteBlock(title: string, enml: string, extra = ""): string {
  return `<note><title>${title}</title><content><![CDATA[<?xml version="1.0"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>${enml}</en-note>]]></content>${extra}</note>`;
}

test("enex files detect as evernote and outrank other sources", () => {
  const input = tree({
    files: [
      { relativePath: "Export.enex", content: enex(noteBlock("A", "<div>hi</div>")) },
      { relativePath: "Note.md", content: "# Note" },
    ],
  });
  assert.equal(evernoteSource.detect(input), 0.95);
  assert.equal(detectImportSource(importSources, input)?.id, "evernote");
});

test("a json file named .enex without en-export does not detect", () => {
  const input = tree({
    files: [{ relativePath: "fake.enex", content: "{}" }],
  });
  assert.equal(evernoteSource.detect(input), 0);
});

test("evernote notes carry title, tags, and utc timestamps", () => {
  const content = enex(
    noteBlock(
      "Meeting notes",
      "<div>Body</div>",
      "<created>20260105T093000Z</created><updated>20260106T101500Z</updated><tag>work</tag><tag>Work</tag><tag>meetings</tag>",
    ),
  );
  const bundle = evernoteSource.parse(
    tree({ files: [{ relativePath: "Export.enex", content }] }),
  );
  assert.equal(bundle.notes.length, 1);
  const note = bundle.notes[0];
  assert.equal(note?.title, "Meeting notes");
  assert.deepEqual(note?.tags, ["work", "meetings"]);
  assert.equal(note?.createdAt, Date.UTC(2026, 0, 5, 9, 30, 0));
  assert.equal(note?.modifiedAt, Date.UTC(2026, 0, 6, 10, 15, 0));
  assert.equal(note?.relativePath, "Meeting notes.md");
});

test("duplicate titles get numbered paths and a single enex adds no folder", () => {
  const content = enex(
    noteBlock("Same", "<div>one</div>") + noteBlock("Same", "<div>two</div>"),
  );
  const bundle = evernoteSource.parse(
    tree({ files: [{ relativePath: "Export.enex", content }] }),
  );
  assert.deepEqual(
    bundle.notes.map((note) => note.relativePath),
    ["Same.md", "Same (2).md"],
  );
  assert.deepEqual(bundle.directories, []);
});

test("multiple enex files become folders named after each export", () => {
  const bundle = evernoteSource.parse(
    tree({
      files: [
        { relativePath: "Work.enex", content: enex(noteBlock("A", "<div>a</div>")) },
        { relativePath: "Home.enex", content: enex(noteBlock("B", "<div>b</div>")) },
      ],
    }),
  );
  assert.deepEqual(bundle.directories, ["Work", "Home"]);
  assert.deepEqual(
    bundle.notes.map((note) => note.relativePath),
    ["Work/A.md", "Home/B.md"],
  );
});

test("attachments and encrypted blocks surface as warnings", () => {
  const content = enex(
    noteBlock(
      "Media",
      '<div><en-media type="image/png" hash="abc"/></div><div><en-crypt cipher="AES">x</en-crypt></div>',
    ),
  );
  const bundle = evernoteSource.parse(
    tree({ files: [{ relativePath: "Export.enex", content }] }),
  );
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("attachment")));
  assert.ok(
    bundle.warnings.some(
      (warning) =>
        warning.message.includes("encrypted") && warning.severity === "error",
    ),
  );
  assert.ok(bundle.notes[0]?.markdown.includes("(attachment)"));
});

test("evernote timestamps parse only the exact compact format", () => {
  assert.equal(
    evernoteTimestampToMillis("20260105T093000Z"),
    Date.UTC(2026, 0, 5, 9, 30, 0),
  );
  assert.equal(evernoteTimestampToMillis("2026-01-05"), undefined);
  assert.equal(evernoteTimestampToMillis(null), undefined);
});

test("enml converts structure to markdown", () => {
  const { markdown } = enmlToMarkdown(
    '<en-note><h2>Title</h2><div>Plain with <b>bold</b> and <i>italic</i> and <code>code</code>.</div><div><br/></div><ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul><ol><li>first</li><li>second</li></ol><div><en-todo checked="true"/>done</div><div><en-todo/>open</div><hr/><div>See <a href="https://example.com">example</a></div></en-note>',
  );
  assert.equal(
    markdown,
    [
      "## Title",
      "",
      "Plain with **bold** and *italic* and `code`.",
      "",
      "- one",
      "- two",
      "  - nested",
      "",
      "1. first",
      "2. second",
      "",
      "[x] done",
      "",
      "[ ] open",
      "",
      "---",
      "",
      "See [example](https://example.com)",
    ].join("\n"),
  );
});

test("enml code blocks and pre become fences", () => {
  const codeBlock = enmlToMarkdown(
    '<en-note><div style="--en-codeblock:true;"><div>line one</div><div>line two</div></div></en-note>',
  );
  assert.equal(codeBlock.markdown, "```\nline one\nline two\n```");
  const pre = enmlToMarkdown("<en-note><pre>a\nb</pre></en-note>");
  assert.equal(pre.markdown, "```\na\nb\n```");
});

test("enml tables become pipe tables and entities decode", () => {
  const { markdown } = enmlToMarkdown(
    "<en-note><table><tr><td>Name</td><td>Value</td></tr><tr><td>Fish &amp; chips</td><td>&#163;7</td></tr></table></en-note>",
  );
  assert.equal(
    markdown,
    ["| Name | Value |", "| --- | --- |", "| Fish & chips | £7 |"].join("\n"),
  );
});

test("empty inline marks collapse instead of leaving bare markers", () => {
  const { markdown } = enmlToMarkdown(
    "<en-note><div>before <b> </b>after <b>kept </b>tail</div></en-note>",
  );
  assert.equal(markdown, "before after **kept** tail");
});
