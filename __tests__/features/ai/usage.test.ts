import { describe, expect, test } from "bun:test";
import {
  mapUsageRow,
  normalizeAiUsagePagination,
  readUsageMetadata,
  resolveAiHumanAction,
} from "@/features/ai/usage-utils";

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

  test("normalizes usage pagination bounds", () => {
    expect(normalizeAiUsagePagination({ limit: 500, offset: -10 })).toEqual({
      limit: 50,
      offset: 0,
    });
    expect(normalizeAiUsagePagination({ limit: 0, offset: Number.NaN })).toEqual({
      limit: 1,
      offset: 0,
    });
  });

  test("maps database rows to profile usage rows", () => {
    const row = mapUsageRow({
      id: "usage-1",
      user_id: "user-1",
      provider: "gemini",
      model: "gemini-1.5-flash",
      action: "generateTitle",
      human_action: "Triggered generate title",
      resource_type: "note",
      resource_id: "note-1",
      resource_url: "/notes/note-1",
      prompt: "Generate a title",
      status: "success",
      error_message: null,
      input_tokens: 12,
      output_tokens: 3,
      total_tokens: 15,
      key_source: "user_key",
      metadata: null,
      created_at: "2026-05-08T14:30:00.000Z",
    });

    expect(row).toEqual({
      id: "usage-1",
      userId: "user-1",
      provider: "gemini",
      model: "gemini-1.5-flash",
      action: "generateTitle",
      humanAction: "Triggered generate title",
      resourceType: "note",
      resourceId: "note-1",
      resourceUrl: "/notes/note-1",
      prompt: "Generate a title",
      status: "success",
      errorMessage: null,
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
      keySource: "user_key",
      metadata: {},
      createdAt: "2026-05-08T14:30:00.000Z",
    });
  });
});
