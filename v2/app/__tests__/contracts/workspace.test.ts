import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKSPACE_PROTOCOL_VERSION,
  envelope,
  type WorkspaceOperation,
} from "../../src/contracts/workspace";

test("protocol version is a positive integer", () => {
  assert.equal(typeof WORKSPACE_PROTOCOL_VERSION, "number");
  assert.ok(WORKSPACE_PROTOCOL_VERSION > 0);
});

test("envelope wraps workspace operation with current protocol version", () => {
  const op: WorkspaceOperation = { type: "set_active_note", noteId: "note_1" };
  const env = envelope(op);

  assert.equal(env.protocolVersion, WORKSPACE_PROTOCOL_VERSION);
  assert.deepEqual(env.operation, op);
});
