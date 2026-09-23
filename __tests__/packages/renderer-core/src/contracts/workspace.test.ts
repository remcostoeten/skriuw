import assert from "node:assert/strict";
import { test } from "vitest";
import {
  WORKSPACE_PROTOCOL_VERSION,
  envelope,
  type WorkspaceOperation,
} from "../../../../../packages/renderer-core/src/contracts/workspace";

test("envelope wraps workspace operation with current protocol version", () => {
  const op: WorkspaceOperation = { type: "set_active_note", noteId: "note_1" };
  const env = envelope(op);

  assert.equal(env.protocolVersion, WORKSPACE_PROTOCOL_VERSION);
  assert.deepEqual(env.operation, op);
});
