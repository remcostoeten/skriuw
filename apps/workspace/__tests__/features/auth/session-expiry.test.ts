import assert from "node:assert/strict";
import test from "node:test";
import {
  listenForSessionExpiry,
  SYNC_SESSION_EXPIRED_EVENT,
} from "../../../src/features/auth/session-expiry";

test("desktop session expiry arrives through the shell event", async () => {
  let handler: (() => void) | null = null;
  let expiries = 0;
  const unlisten = await listenForSessionExpiry(
    () => {
      expiries += 1;
    },
    async (event, nextHandler) => {
      assert.equal(event, SYNC_SESSION_EXPIRED_EVENT);
      handler = nextHandler;
      return () => {
        handler = null;
      };
    },
    false,
  );
  assert.ok(handler);
  handler();
  assert.equal(expiries, 1);
  unlisten();
  assert.equal(handler, null);
});

test("browser session expiry uses the in-process driver subscription", async () => {
  let handler: (() => void) | null = null;
  let expiries = 0;
  const unlisten = await listenForSessionExpiry(
    () => {
      expiries += 1;
    },
    async () => assert.fail("the Tauri listener must stay unused in a browser"),
    true,
    (listener) => {
      handler = listener;
      return () => {
        handler = null;
      };
    },
  );
  assert.ok(handler);
  handler();
  assert.equal(expiries, 1);
  unlisten();
  assert.equal(handler, null);
});
