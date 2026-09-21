import assert from "node:assert/strict";
import test from "node:test";
import { describeStartupFailure } from "../startup-failure";
import { describeCoreLoadFailure } from "../workspace-bridge";
import { loadWorkspaceBridge } from "../workspace-bridge.web";

test("a missing native core is reported as something the reader can act on", () => {
  const resolverError = new Error("Cannot find native module 'SkriuwCore'");
  const failure = describeStartupFailure(describeCoreLoadFailure(resolverError));

  assert.equal(failure.code, null);
  assert.match(failure.message, /does not include the Skriuw core module/);
  assert.match(failure.message, /Expo Go cannot load the native core/);
});

test("the resolver's own message is kept as the cause for diagnostics", () => {
  const resolverError = new Error("Cannot find native module 'SkriuwCore'");
  assert.equal(describeCoreLoadFailure(resolverError).cause, resolverError);
});

test("web opens the preview workspace rather than reaching for a core it has no way to load", async () => {
  const bridge = await loadWorkspaceBridge();
  const snapshot = await bridge.bootstrapWorkspace();

  assert.ok(snapshot.nodes.length > 0);
});
