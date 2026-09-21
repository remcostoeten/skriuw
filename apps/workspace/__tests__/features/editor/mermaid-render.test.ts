import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  MERMAID_UNSUPPORTED_NOTE,
  clearMermaidRenderCache,
  detectMermaidFamily,
  hslTripletToColor,
  isMermaidFence,
  isRenderableMermaidFence,
  mermaidRenderCacheSize,
  mermaidTemplates,
  primaryFontFamily,
  readMermaidPalette,
  renderMermaidSvg,
  sanitizeMermaidSvg,
  type MermaidPalette,
} from "../../../src/features/editor/mermaid-render";

const palette: MermaidPalette = {
  bg: "hsl(2 0% 7%)",
  fg: "hsl(0 0% 91%)",
  line: "hsl(0 0% 55%)",
  accent: "hsl(0 0% 91%)",
  muted: "hsl(0 0% 55%)",
  surface: "hsl(0 0% 9%)",
  border: "hsl(0 0% 18%)",
};

const options = { animate: false, font: "system-ui" };

afterEach(() => {
  clearMermaidRenderCache();
});

test("family detection reads the first meaningful header line", () => {
  assert.equal(detectMermaidFamily("graph TD\n  A --> B"), "flowchart");
  assert.equal(detectMermaidFamily("flowchart LR\n  A --> B"), "flowchart");
  assert.equal(detectMermaidFamily("%% comment\n\n  sequenceDiagram\n  A->>B: hi"), "sequence");
  assert.equal(detectMermaidFamily("stateDiagram-v2\n  [*] --> A"), "state");
  assert.equal(detectMermaidFamily("stateDiagram\n  [*] --> A"), "state");
  assert.equal(detectMermaidFamily("classDiagram\n  class A"), "class");
  assert.equal(detectMermaidFamily("erDiagram\n  A ||--o{ B : has"), "er");
});

test("gantt, pie, mindmap, and empty sources are unsupported", () => {
  for (const source of ["gantt\n  title x", "pie\n  \"a\": 1", "mindmap\n  root", "", "   \n%% only"]) {
    assert.equal(detectMermaidFamily(source), "unsupported", JSON.stringify(source));
  }
  assert.equal(detectMermaidFamily("graphics are not a header"), "unsupported");
});

test("only mermaid and diagram fences are candidates for rendering", () => {
  assert.equal(isMermaidFence("mermaid"), true);
  assert.equal(isMermaidFence("Mermaid extra"), true);
  assert.equal(isMermaidFence("diagram"), true);
  assert.equal(isMermaidFence("ts"), false);
  assert.equal(isRenderableMermaidFence("mermaid", "sequenceDiagram\n A->>B: x"), true);
  assert.equal(isRenderableMermaidFence("mermaid", "gantt"), false);
  assert.equal(isRenderableMermaidFence("ts", "sequenceDiagram"), false);
});

test("theme triplets convert to hsl() and complete colors pass through", () => {
  assert.equal(hslTripletToColor("2 0% 7%"), "hsl(2 0% 7%)");
  assert.equal(hslTripletToColor(" 40 16% 95% "), "hsl(40 16% 95%)");
  assert.equal(hslTripletToColor("0 0% 0% / 0.5"), "hsl(0 0% 0% / 0.5)");
  assert.equal(hslTripletToColor("#ffffff"), "#ffffff");
  assert.equal(hslTripletToColor(""), null);
});

test("the palette reader maps theme tokens and falls back without computed styles", () => {
  const values: Record<string, string> = {
    "--background": "40 16% 95%",
    "--foreground": "30 10% 14%",
    "--muted-foreground": "30 8% 38%",
    "--card": "40 18% 97%",
    "--border": "40 12% 82%",
  };
  const previous = globalThis.getComputedStyle;
  (globalThis as any).getComputedStyle = () => ({
    getPropertyValue: (name: string) => values[name] ?? "",
  });
  try {
    const read = readMermaidPalette({} as HTMLElement);
    assert.equal(read.bg, "hsl(40 16% 95%)");
    assert.equal(read.fg, "hsl(30 10% 14%)");
    assert.equal(read.surface, "hsl(40 18% 97%)");
    assert.equal(read.border, "hsl(40 12% 82%)");
    assert.equal(read.line, "hsl(30 8% 38%)");
  } finally {
    if (previous === undefined) {
      delete (globalThis as any).getComputedStyle;
    } else {
      globalThis.getComputedStyle = previous;
    }
  }
  assert.deepEqual(readMermaidPalette(null), palette);
});

test("the primary font family is the unquoted head of the stack", () => {
  assert.equal(primaryFontFamily('"Segoe UI", system-ui, sans-serif'), "Segoe UI");
  assert.equal(primaryFontFamily("system-ui, -apple-system"), "system-ui");
  assert.equal(primaryFontFamily(""), "system-ui");
});

test("sanitizing strips font imports, scripts, handlers, and javascript links", () => {
  const dirty = [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" onload=\"steal()\">",
    "<style>",
    "  @import url('https://fonts.googleapis.com/css2?family=Geist');",
    "  text { font-family: 'Geist'; }",
    "</style>",
    "<script>alert(1)</script>",
    "<a href=\"javascript:alert(1)\" onclick='x()'><text>A</text></a>",
    "</svg>",
  ].join("\n");
  const clean = sanitizeMermaidSvg(dirty);
  assert.equal(clean.includes("@import"), false);
  assert.equal(clean.includes("fonts.googleapis"), false);
  assert.equal(clean.includes("<script"), false);
  assert.equal(/\son[a-z]+=/i.test(clean), false);
  assert.equal(clean.includes("javascript:"), false);
  assert.equal(clean.includes("font-family: 'Geist'"), true);
  assert.equal(clean.includes("<text>A</text>"), true);
});

test("rendering a sequence diagram yields sanitized SVG with real dimensions", async () => {
  const result = await renderMermaidSvg("sequenceDiagram\n  Alice->>Bob: Hello", palette, options);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.svg.startsWith("<svg"));
  assert.ok(result.width > 0 && result.height > 0);
  assert.equal(result.svg.includes("fonts.googleapis"), false);
  assert.equal(result.svg.includes("<script"), false);
  assert.ok(result.svg.includes("Hello"));
  assert.ok(result.svg.includes("hsl(2 0% 7%)"));
});

test("every slash template renders in its own family", async () => {
  for (const entry of mermaidTemplates) {
    assert.equal(detectMermaidFamily(entry.source), entry.family, entry.id);
    assert.ok(entry.caret > 0 && entry.caret < entry.source.length, entry.id);
    const result = await renderMermaidSvg(entry.source, palette, options);
    assert.equal(result.ok, true, `${entry.id}: ${result.ok ? "" : result.message}`);
  }
});

test("animated flowcharts and state diagrams carry the reduced-motion guard", async () => {
  for (const source of ["graph TD\n  A --> B", "stateDiagram-v2\n  [*] --> A"]) {
    const result = await renderMermaidSvg(source, palette, { ...options, animate: true });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.svg.includes("prefers-reduced-motion"), source);
  }
});

test("bad source, unsupported families, and empty output become error results", async () => {
  const unsupported = await renderMermaidSvg("gantt\n  title x", palette, options);
  assert.deepEqual(unsupported, { ok: false, message: MERMAID_UNSUPPORTED_NOTE });
  const degenerate = await renderMermaidSvg("sequenceDiagram\n  Alice->>", palette, options);
  assert.equal(degenerate.ok, false);
  const thrown = await renderMermaidSvg("graph TD\n  A --> B", palette, options, async () => {
    throw new Error("Parse error on line 2");
  });
  assert.deepEqual(thrown, { ok: false, message: "Parse error on line 2" });
});

test("identical source, palette, and options hit the memo", async () => {
  let calls = 0;
  async function fake() {
    calls += 1;
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"8\"></svg>";
  }
  const first = await renderMermaidSvg("graph TD\n  A --> B", palette, options, fake);
  const second = await renderMermaidSvg("graph TD\n  A --> B", palette, options, fake);
  assert.equal(calls, 1);
  assert.equal(first, second);
  await renderMermaidSvg("graph TD\n  A --> B", { ...palette, bg: "#fff" }, options, fake);
  assert.equal(calls, 2);
  await renderMermaidSvg("graph TD\n  A --> B", palette, { ...options, animate: true }, fake);
  assert.equal(calls, 3);
  assert.equal(mermaidRenderCacheSize(), 3);
});

test("the memo stays bounded", async () => {
  async function fake() {
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"></svg>";
  }
  for (let index = 0; index < 80; index += 1) {
    await renderMermaidSvg(`graph TD\n  A${index} --> B`, palette, options, fake);
  }
  assert.equal(mermaidRenderCacheSize(), 64);
});
