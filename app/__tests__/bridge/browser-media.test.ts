import assert from "node:assert/strict";
import test from "node:test";
import { sniffMediaMime } from "../../src/bridge/browser-media";

function bytes(...values: (number | string)[]): Uint8Array {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number") {
      out.push(value);
    } else {
      out.push(...new TextEncoder().encode(value));
    }
  }
  return new Uint8Array(out);
}

test("sniffMediaMime mirrors the Rust magic-byte sniffer", () => {
  assert.equal(
    sniffMediaMime(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d)),
    "image/png",
  );
  assert.equal(sniffMediaMime(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffMediaMime(bytes("GIF89a......")), "image/gif");
  assert.equal(sniffMediaMime(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 ")), "image/webp");
  assert.equal(sniffMediaMime(bytes(0, 0, 0, 0x20, "ftypisom", 0, 0, 2, 0)), "video/mp4");
  assert.equal(
    sniffMediaMime(bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 0, 0, 0, 0, 0, 0, 0x1f, 0x42, 0x86, "webm")),
    "video/webm",
  );
  assert.equal(
    sniffMediaMime(
      bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 0, 0, 0, 0, 0, 0, 0x23, 0x42, 0x86, "matroska"),
    ),
    null,
  );
  assert.equal(sniffMediaMime(bytes("<svg></svg>")), null);
});
