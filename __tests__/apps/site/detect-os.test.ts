import { describe, expect, it } from "vitest";

import { detectOs } from "@/data/downloads";

const agents = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
};

describe("detectOs", () => {
  it("maps desktop browsers to their build", () => {
    expect(detectOs(agents.mac)).toBe("macos");
    expect(detectOs(agents.windows)).toBe("windows");
    expect(detectOs(agents.linux)).toBe("linux");
  });

  it("offers every platform to phones, tablets, and Chromebooks", () => {
    expect(detectOs(agents.android)).toBe("unknown");
    expect(detectOs(agents.iphone)).toBe("unknown");
    expect(detectOs(agents.chromebook)).toBe("unknown");
    expect(detectOs("")).toBe("unknown");
  });

  it("treats a touch Mac user agent as an iPad", () => {
    expect(detectOs(agents.mac, 5)).toBe("unknown");
  });
});
