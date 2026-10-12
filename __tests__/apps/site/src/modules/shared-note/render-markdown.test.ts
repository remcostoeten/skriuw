import { describe, expect, it } from "vitest";

import { renderSharedNote, showsOutline } from "@/modules/shared-note/render-markdown";

describe("renderSharedNote headings", () => {
  it("anchors every heading with a unique slug id", () => {
    const { html, headings } = renderSharedNote(
      "## Aanpak\n\n### Stap één\n\n## Aanpak\n\n#### Detail",
    );
    expect(html).toContain('<h2 id="aanpak"><a class="doc-anchor" href="#aanpak">Aanpak</a></h2>');
    expect(html).toContain('<h3 id="stap-een">');
    expect(html).toContain('<h2 id="aanpak-2">');
    expect(html).toContain('<h4 id="detail">');
    expect(headings).toEqual([
      { id: "aanpak", text: "Aanpak", depth: 2 },
      { id: "stap-een", text: "Stap één", depth: 3 },
      { id: "aanpak-2", text: "Aanpak", depth: 2 },
    ]);
  });

  it("escapes untrusted heading text in the markup and keeps outline labels plain", () => {
    const { html, headings } = renderSharedNote('## <img src=x onerror="alert(1)"> & "quotes"');
    expect(html).not.toMatch(/<img/);
    expect(html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;quotes&quot;",
    );
    expect(html).toMatch(/<h2 id="img-src-x-onerror-alert-1-quotes">/);
    expect(headings[0]?.text).toBe('<img src=x onerror="alert(1)"> & "quotes"');
  });

  it("does not nest anchors when the heading holds a link", () => {
    const { html } = renderSharedNote("## See [docs](https://skriuw.com)");
    expect(html).toMatch(/^<h2 id="see-docs">See <a href="https:\/\/skriuw.com"/);
    expect(html).not.toContain("doc-anchor");
  });

  it("drops a leading h1 that repeats the note title", () => {
    const { html } = renderSharedNote(
      "\n# Project  plan\n\nIntro\n\n# Project plan",
      "Project plan",
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.indexOf("<p>Intro</p>")).toBeLessThan(html.indexOf("<h1"));
  });

  it("keeps a leading h1 that differs from the title", () => {
    const { html } = renderSharedNote("# Something else\n\nIntro", "Project plan");
    expect(html).toContain('<h1 id="something-else">');
  });
});

describe("showsOutline", () => {
  it("needs at least three h2 or h3 headings", () => {
    const two = renderSharedNote("## A\n\n### B\n\n#### C\n\n# D").headings;
    const three = renderSharedNote("## A\n\n### B\n\n## C").headings;
    expect(showsOutline(two)).toBe(false);
    expect(showsOutline(three)).toBe(true);
  });
});
