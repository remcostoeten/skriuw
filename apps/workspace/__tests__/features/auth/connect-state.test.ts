import assert from "node:assert/strict";
import test from "node:test";
import {
  clearConnectFailure,
  connectFailureDescription,
  latestConnectFailure,
  reportConnectFailure,
  subscribeConnectFailure,
} from "../../../src/features/auth/connect-state";

test("a connect failure is published to subscribers and described distinctly from a pause", () => {
  const seen: (string | null)[] = [];
  const unsubscribe = subscribeConnectFailure(() => seen.push(latestConnectFailure()));
  reportConnectFailure(new Error("the cloud workspace state request failed: 503"));
  assert.deepEqual(seen, ["the cloud workspace state request failed: 503"]);
  assert.equal(
    connectFailureDescription(latestConnectFailure() ?? ""),
    "Sync could not start: the cloud workspace state request failed: 503",
  );
  assert.ok(!connectFailureDescription("x").startsWith("Paused"));
  clearConnectFailure();
  assert.equal(latestConnectFailure(), null);
  assert.deepEqual(seen, ["the cloud workspace state request failed: 503", null]);
  clearConnectFailure();
  assert.equal(seen.length, 2, "clearing an already clear failure stays silent");
  unsubscribe();
  reportConnectFailure("plain text");
  assert.equal(latestConnectFailure(), "plain text");
  assert.equal(seen.length, 2);
  clearConnectFailure();
});

test("a storage worker failure object reports its message instead of [object Object]", () => {
  reportConnectFailure({
    code: "invalid_request",
    message: "This workspace is linked to another cloud workspace.",
    recovery: "Correct the request and retry.",
    terminal: false,
  });
  assert.equal(latestConnectFailure(), "This workspace is linked to another cloud workspace.");
  reportConnectFailure({ code: "worker_crashed" });
  assert.equal(latestConnectFailure(), "[object Object]");
  clearConnectFailure();
});
