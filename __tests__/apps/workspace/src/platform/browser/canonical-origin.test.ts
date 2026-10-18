import { describe, expect, it } from "vitest";
import { canonicalBrowserUrl } from "@/platform/browser/canonical-origin";

describe("canonicalBrowserUrl", () => {
  it("moves the deployment alias to the canonical origin", () => {
    expect(canonicalBrowserUrl("https://skriuw.vercel.app/app/")).toBe("https://skriuw.com/app/");
  });

  it("preserves the path, query, and fragment", () => {
    expect(canonicalBrowserUrl("https://skriuw.vercel.app/app/?note=one#editor")).toBe(
      "https://skriuw.com/app/?note=one#editor",
    );
  });

  it("leaves canonical and local URLs alone", () => {
    expect(canonicalBrowserUrl("https://skriuw.com/app/")).toBeNull();
    expect(canonicalBrowserUrl("http://localhost:5183/")).toBeNull();
  });
});
