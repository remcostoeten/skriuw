import assert from "node:assert/strict";
import test from "node:test";
import {
  panelGridTemplate,
  panelTracksWith,
} from "../../src/shell/panel-layout";

test("notes panels use bounded responsive tracks and collapse independently", () => {
  assert.equal(
    panelGridTemplate("notes", true, true),
    "56px 260px minmax(300px, 1fr) 240px",
  );
  assert.equal(
    panelGridTemplate("notes", false, true),
    "56px 0px minmax(300px, 1fr) 240px",
  );
  assert.equal(
    panelGridTemplate("notes", true, false),
    "56px 260px minmax(300px, 1fr) 0px",
  );
  assert.equal(panelGridTemplate("trash", true, true), "56px 1fr");
});

test("notes panel tracks follow the resized widths", () => {
  assert.equal(
    panelGridTemplate("notes", true, true, 320),
    "56px 320px minmax(300px, 1fr) 240px",
  );
  assert.equal(
    panelGridTemplate("notes", true, true, 320, 300),
    "56px 320px minmax(300px, 1fr) 300px",
  );
  assert.equal(
    panelGridTemplate("notes", true, false, 320, 300),
    "56px 320px minmax(300px, 1fr) 0px",
  );
});

test("a dragged panel projects onto the settled tracks without disturbing the other", () => {
  const settled = {
    sidebarOpen: true,
    metadataOpen: true,
    sidebarWidth: 260,
    metadataWidth: 240,
  };
  assert.deepEqual(panelTracksWith(settled, "metadata", 320, false), {
    sidebarOpen: true,
    metadataOpen: true,
    sidebarWidth: 260,
    metadataWidth: 320,
  });
  assert.deepEqual(panelTracksWith(settled, "sidebar", 200, true), {
    sidebarOpen: false,
    metadataOpen: true,
    sidebarWidth: 200,
    metadataWidth: 240,
  });
});
