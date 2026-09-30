import assert from "node:assert/strict";
import { test } from "vitest";
import { isInertSvg } from "@/bridge/inert-svg";
import { sniffMediaMime } from "@/bridge/browser-media";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

test("plain SVG badges are admitted as image/svg+xml", () => {
  const badge = `<?xml version="1.0"?>
<!-- badge -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="80" height="20"><title>License: MIT</title><image xlink:href="data:image/png;base64,AAAA"/><text>MIT</text></svg>`;
  assert.equal(isInertSvg(bytes(badge)), true);
  assert.equal(sniffMediaMime(bytes(badge)), "image/svg+xml");
  assert.equal(isInertSvg(bytes("<svg><text>button online</text></svg>")), true);
});

test("SVG with active content or a non-SVG root is refused", () => {
  for (const source of [
    "<svg><script>alert(1)</script></svg>",
    '<svg onload="alert(1)"></svg>',
    "<svg><rect\n  onclick = 'x()'/></svg>",
    "<svg><foreignObject><iframe/></foreignObject></svg>",
    '<!DOCTYPE svg [<!ENTITY a "b">]><svg></svg>',
    '<svg><a href="javascript:alert(1)">x</a></svg>',
    '<svg><image href="https://tracker.example/p.png"/></svg>',
    "<svg><style>@import url(x.css);</style></svg>",
    "<html><svg></svg></html>",
    "<svgx></svgx>",
  ]) {
    assert.equal(isInertSvg(bytes(source)), false, source);
  }
  assert.equal(isInertSvg(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x20, 0xff, 0x3e])), false);
});
