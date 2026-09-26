import { describe, expect, it } from "vitest";

import { releaseHeadline } from "@/modules/changelog/utilities/release-headline";

describe("releaseHeadline", () => {
  it("prefers the first bold highlight", () => {
    const body = "## Highlights\n\n**One local workspace per cloud account** (#378). Long text.";

    expect(releaseHeadline(body)).toBe("One local workspace per cloud account");
  });

  it("falls back to the first non-chore change bullet", () => {
    const body = [
      "## Changes since v2-v0.46.0",
      "",
      "- chore(v2): release v2-v0.46.1",
      "- fix(sync): keep sync always on while signed in (#474)",
      "- fix(lock): relock when the tab is hidden (#471)",
    ].join("\n");

    expect(releaseHeadline(body)).toBe("Keep sync always on while signed in");
  });

  it("shortens long headlines at a word boundary", () => {
    const body = "**Signing into a second account on the same install no longer dead-ends**";

    expect(releaseHeadline(body)).toBe("Signing into a second account on the same…");
  });

  it("returns nothing for empty notes", () => {
    expect(releaseHeadline("")).toBeUndefined();
  });
});
