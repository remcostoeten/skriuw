import { describe, expect, it } from "vitest";

import { renderSharedMarkdown } from "@/lib/shared-note-markdown";

describe("renderSharedMarkdown", () => {
  it("renders ordinary note Markdown", () => {
    const html = renderSharedMarkdown(
      "# Trip\n\n- [x] Book **train**\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n`code`",
    );
    expect(html).toContain("<h1>Trip</h1>");
    expect(html).toContain("<strong>train</strong>");
    expect(html).toContain("<table>");
    expect(html).toContain("<code>code</code>");
  });

  it("escapes raw HTML instead of rendering it", () => {
    const html = renderSharedMarkdown(
      'Hi <img src=x onerror="alert(1)"> there\n\n<script>alert(1)</script>\n\n<iframe src="https://evil.test"></iframe>',
    );
    expect(html).not.toMatch(/<img|<script|<iframe/);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps only http, https, and mailto links", () => {
    const html = renderSharedMarkdown(
      '[site](https://skriuw.com "Home") [mail](mailto:a@b.test) [bad](javascript:alert(1)) [data](data:text/html,x) <javascript:alert(1)>',
    );
    expect(html).toContain('href="https://skriuw.com"');
    expect(html).toContain('rel="noreferrer nofollow ugc"');
    expect(html).toContain('href="mailto:a@b.test"');
    expect(html).not.toMatch(/href="(javascript|data):/i);
    expect(html).toContain("bad");
  });

  it("escapes attribute breakouts in link titles", () => {
    const html = renderSharedMarkdown('[x](https://a.test "a\\" onmouseover=\\"alert(1)")');
    expect(html).not.toContain('" onmouseover="');
  });

  it("replaces local images, media, and drawings with placeholders", () => {
    const html = renderSharedMarkdown(
      '![Beach](images/img-1)\n\n[Clip](images/vid-1)<!--skriuw-media:video-->\n\n```drawing\n{"elements":[]}\n```',
    );
    expect(html).toContain("Image not included: Beach");
    expect(html).not.toContain("images/");
    expect(html).not.toContain("skriuw-media");
    expect(html).toContain("Clip");
    expect(html).toContain("Drawing not included");
    expect(html).not.toContain("elements");
  });

  it("shows note mentions as plain text but leaves code untouched", () => {
    const html = renderSharedMarkdown("See [[Packing list]].\n\n```\n[[literal]] <b>\n```");
    expect(html).toContain("See Packing list.");
    expect(html).toContain("[[literal]] &lt;b&gt;");
  });
});
