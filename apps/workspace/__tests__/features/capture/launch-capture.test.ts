import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLaunchCapture,
  shareNoteMarkdown,
  stripLaunchCapture,
} from "../../../src/features/capture/launch-capture";

test("manifest shortcuts map to note and journal captures", () => {
  assert.deepEqual(parseLaunchCapture("?capture=note"), { kind: "note" });
  assert.deepEqual(parseLaunchCapture("?capture=journal"), { kind: "journal" });
  assert.equal(parseLaunchCapture("?capture=other"), null);
});

test("unrelated queries and an empty share are not captures", () => {
  assert.equal(parseLaunchCapture(""), null);
  assert.equal(parseLaunchCapture("?onboarding=skip"), null);
  assert.equal(parseLaunchCapture("?title=&text=%20&url="), null);
});

test("a share carries title, text, and url", () => {
  assert.deepEqual(
    parseLaunchCapture("?title=Hello&text=Some%20text&url=https%3A%2F%2Fexample.com%2Fa"),
    { kind: "share", title: "Hello", text: "Some text", url: "https://example.com/a" },
  );
});

test("a share whose text is only a link treats it as the url", () => {
  assert.deepEqual(parseLaunchCapture("?text=https%3A%2F%2Fexample.com%2Fpost"), {
    kind: "share",
    title: "",
    text: "",
    url: "https://example.com/post",
  });
});

test("stripLaunchCapture removes capture keys and keeps the rest", () => {
  assert.equal(
    stripLaunchCapture("https://skriuw.com/app/?capture=note#/notes"),
    "https://skriuw.com/app/#/notes",
  );
  assert.equal(
    stripLaunchCapture("https://skriuw.com/app/?onboarding=skip&title=x&text=y&url=z"),
    "https://skriuw.com/app/?onboarding=skip",
  );
});

test("shareNoteMarkdown titles from the shared title and appends the link once", () => {
  assert.deepEqual(
    shareNoteMarkdown({ title: "Post", text: "Body", url: "https://example.com/p" }),
    { title: "Post", markdown: "# Post\n\nBody\n\n[Post](https://example.com/p)\n" },
  );
  assert.deepEqual(
    shareNoteMarkdown({
      title: "Post",
      text: "See https://example.com/p",
      url: "https://example.com/p",
    }),
    { title: "Post", markdown: "# Post\n\nSee https://example.com/p\n" },
  );
});

test("shareNoteMarkdown falls back to the first text line, then the host", () => {
  assert.equal(
    shareNoteMarkdown({ title: "", text: "First line\n\nMore", url: "" }).title,
    "First line",
  );
  assert.deepEqual(shareNoteMarkdown({ title: "", text: "", url: "https://example.com/p" }), {
    title: "example.com",
    markdown: "# example.com\n\n[https://example.com/p](https://example.com/p)\n",
  });
  assert.equal(shareNoteMarkdown({ title: "", text: "", url: "not a url" }).title, "Shared note");
});

test("shareNoteMarkdown keeps titles to a readable length", () => {
  const title = shareNoteMarkdown({ title: "x".repeat(200), text: "", url: "" }).title;
  assert.equal(title.length, 80);
  assert.ok(title.endsWith("…"));
});
