import assert from "node:assert/strict";
import { test } from "vitest";
import { mathMacrosFromSettings, parseMathMacrosDraft } from "@/features/editor/math/macros";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/features/settings/settings-model";
import { cachedMathRender, renderMath, validateMathMacros } from "@/features/editor/math/render";

test("macros expand with arguments and refresh the cache on definition changes", async () => {
  const macros = { "\\R": "\\mathbb{R}", "\\norm": "\\left\\lVert #1 \\right\\rVert" };
  assert.equal(await validateMathMacros(macros), null);
  const result = await renderMath("\\norm{\\R}", false, null, macros);
  assert.ok(result.ok && result.html.includes("mathbb"));
  const changed = { ...macros, "\\R": "\\mathbb{C}" };
  assert.equal(cachedMathRender("\\norm{\\R}", false, changed), null);
  const updated = await renderMath("\\norm{\\R}", false, null, changed);
  assert.notDeepEqual(result, updated);
});

test("invalid and recursive definitions are rejected before saving", async () => {
  assert.match((await validateMathMacros({ "\\R": "x^{" })) ?? "", /\\R/);
  assert.match((await validateMathMacros({ "\\R": "\\R" })) ?? "", /\\R/);
  assert.match((await validateMathMacros({ "\\R": "\\missing" })) ?? "", /referenced commands/);
});

test("drafts require unique bounded command names and definitions", () => {
  assert.deepEqual(parseMathMacrosDraft("\\R = \\mathbb{R}\n\\norm = |#1|"), {
    ok: true,
    macros: { "\\R": "\\mathbb{R}", "\\norm": "|#1|" },
  });
  for (const draft of ["R = x", "\\R", "\\R =", "\\R = x\n\\R = y", `\\R = ${"x".repeat(4097)}`]) {
    assert.equal(parseMathMacrosDraft(draft).ok, false, draft.slice(0, 30));
  }
  assert.deepEqual(parseMathMacrosDraft(""), { ok: true, macros: {} });
});

test("persisted settings reject malformed macros at the boundary", () => {
  assert.deepEqual(
    mathMacrosFromSettings({
      ...DEFAULT_WORKSPACE_SETTINGS,
      mathMacros: { "\\R": "\\mathbb{R}", invalid: "x", "\\bad": 12 },
    }),
    { "\\R": "\\mathbb{R}" },
  );
  assert.deepEqual(mathMacrosFromSettings({ ...DEFAULT_WORKSPACE_SETTINGS, mathMacros: [] }), {});
});

test("mhchem renders chemical formulae and physical units in both modes", async () => {
  for (const display of [false, true]) {
    for (const tex of ["\\ce{H2O}", "\\pu{123 kJ/mol}"]) {
      const result = await renderMath(tex, display);
      assert.ok(result.ok, !result.ok ? result.message : tex);
      assert.ok(result.ok && result.html.includes("<math"));
    }
  }
});
