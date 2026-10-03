import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import {
  cachedMathRender,
  clearMathRenderCache,
  mathErrorMessage,
  renderMath,
} from "@/features/editor/math/render";

beforeEach(() => {
  clearMathRenderCache();
});

test("KaTeX output carries MathML for assistive technology", async () => {
  const result = await renderMath("x^2", false);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.html.includes("<math"));
  assert.ok(result.ok && result.html.includes('encoding="application/x-tex"'));
  assert.ok(result.ok && result.html.includes('class="katex-html" aria-hidden="true"'));
});

test("display mode renders a display equation", async () => {
  const result = await renderMath("\\frac{a}{b}", true);
  assert.ok(result.ok && result.html.includes("katex-display"));
});

test("invalid TeX resolves to a short message instead of throwing", async () => {
  const result = await renderMath("x^{", false);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && !result.message.startsWith("KaTeX"));
  assert.ok(!result.ok && result.message.length > 0);
});

test("untrusted commands are not rendered as links", async () => {
  const result = await renderMath("\\href{javascript:alert(1)}{x}", false);
  assert.ok(!result.ok || !result.html.includes("href="));
});

test("renders are memoized and readable synchronously afterwards", async () => {
  let calls = 0;
  function render(tex: string) {
    calls += 1;
    return `<span>${tex}</span>`;
  }
  assert.equal(cachedMathRender("y", false), null);
  await renderMath("y", false, render);
  await renderMath("y", false, render);
  assert.equal(calls, 1);
  assert.deepEqual(cachedMathRender("y", false), { ok: true, html: "<span>y</span>" });
  assert.equal(cachedMathRender("y", true), null);
});

test("error messages drop the library prefix and echoed source", () => {
  assert.equal(
    mathErrorMessage(new Error("KaTeX parse error: Expected 'EOF', got '}' at position 3: x^}̲")),
    "Expected 'EOF', got '}' at position 3",
  );
  assert.equal(
    mathErrorMessage(
      new Error("KaTeX parse error: Undefined control sequence: \\foo at position 1: \\foo"),
    ),
    "Undefined control sequence: \\foo at position 1",
  );
  assert.equal(mathErrorMessage(""), "This TeX could not be rendered.");
});
