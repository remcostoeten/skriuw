import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveEditorBundle } from "@/editor/bundle-source";
import { decodeBase64, editorBytes, encodeBase64, isEditorBytes } from "@/editor/bytes";
import { describeEditorFailure, isReloadable } from "@/editor/failure-view";
import { parseEditorMessage } from "@/editor/host-messages";
import {
  EDITOR_PROTOCOL_VERSION,
  frameMessageOrigin,
  isFrameMessageOrigin,
} from "@/editor/protocol";

test("an unset or cross-origin entry is refused with an actionable reason", () => {
  assert.equal(resolveEditorBundle(undefined, "embedded").ok, false);
  const blank = resolveEditorBundle("  ", "embedded");
  assert.equal(blank.ok, false);
  assert.match(blank.ok === false ? blank.detail : "", /EXPO_PUBLIC_SKRIUW_EDITOR_ENTRY/);
  assert.match(blank.ok === false ? blank.detail : "", /editor:page/);
  const remote = resolveEditorBundle("https://skriuw.dev/editor/editor.html", "embedded");
  assert.equal(remote.ok, false);
  assert.match(remote.ok === false ? remote.detail : "", /own origin/);
  assert.equal(resolveEditorBundle("//cdn.example/editor.html", "dev-server").ok, false);
});

test("a release build resolves the entry beside the DOM page in www.bundle", () => {
  for (const entry of ["editor/editor.html", "./editor/editor.html", "/editor/editor.html"]) {
    assert.deepEqual(resolveEditorBundle(entry, "embedded"), {
      ok: true,
      uri: "editor/editor.html",
    });
  }
});

test("the dev server resolves the entry from the root it serves public/ at", () => {
  for (const entry of ["editor/editor.html", "./editor/editor.html", "/editor/editor.html"]) {
    assert.deepEqual(resolveEditorBundle(entry, "dev-server"), {
      ok: true,
      uri: "/editor/editor.html",
    });
  }
});

test("frames served from file:// rely on the source check, others on the origin", () => {
  assert.equal(
    frameMessageOrigin("https://localhost:8081/_expo/@dom/x.html"),
    "https://localhost:8081",
  );
  assert.equal(frameMessageOrigin("file:///android_asset/www.bundle/a.html"), "*");
  assert.equal(isFrameMessageOrigin("null", "file:///android_asset/www.bundle/a.html"), true);
  assert.equal(isFrameMessageOrigin("http://localhost:8081", "http://localhost:8081/a"), true);
  assert.equal(isFrameMessageOrigin("https://evil.example", "http://localhost:8081/a"), false);
});

test("base64 round-trips every byte value", () => {
  for (let length = 0; length < 8; length += 1) {
    const bytes = new Uint8Array(length).map((_unused, index) => (index * 37 + length) % 256);
    assert.deepEqual([...decodeBase64(encodeBase64(bytes))], [...bytes]);
  }
  const every = new Uint8Array(256).map((_unused, index) => index);
  assert.deepEqual([...decodeBase64(encodeBase64(every))], [...every]);
  assert.throws(() => decodeBase64("not base64!"), /illegal character/);
});

test("editor byte payloads are recognised by their shape", () => {
  const payload = editorBytes(new Uint8Array([1, 2, 3]).buffer);
  assert.ok(isEditorBytes(payload));
  assert.deepEqual([...decodeBase64(payload.$bytes)], [1, 2, 3]);
  assert.equal(isEditorBytes({ bytes: "AQID" }), false);
  assert.equal(isEditorBytes(null), false);
});

test("the host refuses editor messages it cannot trust", () => {
  assert.equal(parseEditorMessage("not json").ok, false);
  assert.equal(parseEditorMessage({ type: "ready" }).ok, false);
  assert.equal(parseEditorMessage({ v: EDITOR_PROTOCOL_VERSION, type: "sudo" }).ok, false);
  assert.equal(
    parseEditorMessage({ v: EDITOR_PROTOCOL_VERSION, type: "failure", code: "nope", detail: "" })
      .ok,
    false,
  );
  assert.equal(
    parseEditorMessage({
      v: EDITOR_PROTOCOL_VERSION,
      type: "change",
      changeId: 1,
      noteId: null,
      revision: null,
      operations: [],
    }).ok,
    true,
  );
  assert.equal(parseEditorMessage({ v: EDITOR_PROTOCOL_VERSION, type: "ready" }).ok, true);
});

test("a missing bundle offers no reload, every other failure does", () => {
  assert.equal(isReloadable(describeEditorFailure("bundle-missing", "none packaged")), false);
  assert.equal(isReloadable(describeEditorFailure("webview-gone", "reclaimed")), true);
  assert.equal(describeEditorFailure("runtime-error", "x".repeat(900)).detail.length, 512);
});
