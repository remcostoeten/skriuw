import assert from "node:assert/strict";
import test from "node:test";
import { resolveEditorBundle } from "../bundle-source";
import { decodeBase64, editorBytes, encodeBase64, isEditorBytes } from "../bytes";
import { describeEditorFailure, isReloadable } from "../failure-view";
import { parseEditorMessage } from "../host-messages";
import { EDITOR_PROTOCOL_VERSION } from "../protocol";

test("an unset or cross-origin entry is refused with an actionable reason", () => {
  assert.equal(resolveEditorBundle(undefined).ok, false);
  const blank = resolveEditorBundle("  ");
  assert.equal(blank.ok, false);
  assert.match(blank.ok === false ? blank.detail : "", /EXPO_PUBLIC_SKRIUW_EDITOR_ENTRY/);
  const remote = resolveEditorBundle("https://skriuw.dev/editor/index.html");
  assert.equal(remote.ok, false);
  assert.match(remote.ok === false ? remote.detail : "", /same-origin/);
  assert.equal(resolveEditorBundle("//cdn.example/editor.html").ok, false);
});

test("a same-origin entry resolves to a rooted path", () => {
  assert.deepEqual(resolveEditorBundle("editor/index.html"), {
    ok: true,
    uri: "/editor/index.html",
  });
  assert.deepEqual(resolveEditorBundle("./editor/index.html"), {
    ok: true,
    uri: "/editor/index.html",
  });
  assert.deepEqual(resolveEditorBundle("/editor/index.html"), {
    ok: true,
    uri: "/editor/index.html",
  });
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
