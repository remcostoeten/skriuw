import { describe, expect, test } from "bun:test";
import { readUsageMetadata, resolveAiHumanAction } from "@/features/ai/usage-utils";

describe("AI usage helpers", () => {
  test("maps human action labels", () => {
    expect(resolveAiHumanAction("generateTitle")).toBe("Triggered generate title");
    expect(resolveAiHumanAction("customAction")).toBe("customAction");
  });

  test("reads token usage metadata from provider responses", () => {
    const result = readUsageMetadata({
      usageMetadata: {
        promptTokenCount: 142,
        candidatesTokenCount: 18,
        totalTokenCount: 160,
      },
    });

    expect(result.inputTokens).toBe(142);
    expect(result.outputTokens).toBe(18);
    expect(result.totalTokens).toBe(160);
    expect(result.metadata).toEqual({
      usageMetadata: {
        promptTokenCount: 142,
        candidatesTokenCount: 18,
        totalTokenCount: 160,
      },
    });
  });
});
