import assert from "node:assert/strict";
import test from "node:test";
import { isOpenableExternalUrl, openExternalUrl } from "../../src/bridge/external-links";

test("http and https urls are openable", () => {
  assert.equal(isOpenableExternalUrl("https://example.com/path?q=1#frag"), true);
  assert.equal(isOpenableExternalUrl("http://localhost:5173"), true);
});

test("dangerous and non-web schemes are rejected", () => {
  assert.equal(isOpenableExternalUrl("javascript:alert(1)"), false);
  assert.equal(isOpenableExternalUrl("file:///etc/passwd"), false);
  assert.equal(isOpenableExternalUrl("data:text/html,<script>"), false);
  assert.equal(isOpenableExternalUrl("mailto:someone@example.com"), false);
});

test("relative and malformed urls are rejected", () => {
  assert.equal(isOpenableExternalUrl(""), false);
  assert.equal(isOpenableExternalUrl("   "), false);
  assert.equal(isOpenableExternalUrl("/notes/1"), false);
  assert.equal(isOpenableExternalUrl("example.com"), false);
  assert.equal(isOpenableExternalUrl("#anchor"), false);
});

test("openExternalUrl ignores rejected urls without touching window", async () => {
  let opened: string | null = null;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      open(url: string) {
        opened = url;
        return null;
      },
    },
  });
  try {
    await openExternalUrl("javascript:alert(1)");
    assert.equal(opened, null);
    await openExternalUrl("https://example.com");
    assert.equal(opened, "https://example.com");
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  }
});
