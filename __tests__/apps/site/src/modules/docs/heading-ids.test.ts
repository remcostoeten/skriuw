import { describe, expect, it } from "vitest";

import { createHeadingIds, headingText, slugifyHeading } from "@/modules/docs/heading-ids";

describe("slugifyHeading", () => {
  it("folds accents and keeps letters of any script", () => {
    expect(slugifyHeading("Wat is geërfde schuld?")).toBe("wat-is-geerfde-schuld");
    expect(slugifyHeading("Ĳsselmeer en de Afsluitdijk")).toBe("ijsselmeer-en-de-afsluitdijk");
    expect(slugifyHeading("Straße 12")).toBe("straße-12");
    expect(slugifyHeading("日本語のメモ")).toBe("日本語のメモ");
  });

  it("falls back to section when nothing is left", () => {
    expect(slugifyHeading("!!! ---")).toBe("section");
  });
});

describe("createHeadingIds", () => {
  it("suffixes repeated headings and avoids literal collisions", () => {
    const nextId = createHeadingIds();
    expect(nextId("Notes")).toBe("notes");
    expect(nextId("Notes")).toBe("notes-2");
    expect(nextId("Notes 2")).toBe("notes-2-2");
    expect(nextId("Notes")).toBe("notes-3");
  });
});

describe("headingText", () => {
  it("strips tags and decodes escaped entities", () => {
    expect(headingText("Ship &amp; <em>tell</em> &lt;b&gt;")).toBe("Ship & tell <b>");
  });
});
