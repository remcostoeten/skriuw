import { expect, test } from "vitest";
import { escapeHtml } from "@skriuw/shared/helpers/escape-html";

test("escapes every HTML-significant character", () => {
  expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
    "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
  );
});

test("leaves plain text unchanged", () => {
  expect(escapeHtml("Release notes 0.49")).toBe("Release notes 0.49");
});
