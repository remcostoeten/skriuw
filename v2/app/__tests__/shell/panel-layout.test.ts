import assert from "node:assert/strict";
import test from "node:test";
import { panelGridTemplate } from "../../src/shell/panel-layout";

test("notes panels use bounded responsive tracks and collapse independently", () => {
  assert.equal(
    panelGridTemplate("notes", true, true),
    "56px minmax(152px, 260px) minmax(300px, 1fr) minmax(180px, 240px)",
  );
  assert.equal(
    panelGridTemplate("notes", false, true),
    "56px 0px minmax(300px, 1fr) minmax(180px, 240px)",
  );
  assert.equal(
    panelGridTemplate("notes", true, false),
    "56px minmax(152px, 260px) minmax(300px, 1fr) 0px",
  );
  assert.equal(panelGridTemplate("trash", true, true), "56px 1fr");
});
