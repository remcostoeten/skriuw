import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeModelFilter,
  encodeModelFilter,
  formatCostMicros,
  formatDuration,
  runFilterOptions,
  runStateLabel,
  runTokenSummary,
  tokenSourceNote,
  usageByModel,
  usagePeriodStart,
  usageTotals,
} from "../../../src/features/ai/usage-model";
import type { AiRunRecord, AiUsageAggregate } from "../../../src/contracts/ai";

function aggregate(overrides: Partial<AiUsageAggregate> = {}): AiUsageAggregate {
  return {
    day: "2026-08-17",
    providerId: "groq",
    modelId: "openai/gpt-oss-120b",
    runs: 2,
    inputTokens: 1_000,
    outputTokens: 200,
    costMicros: 270,
    estimated: false,
    ...overrides,
  };
}

function run(overrides: Partial<AiRunRecord> = {}): AiRunRecord {
  return {
    runId: "run-1",
    startedAtMs: 1_700_000_000_000,
    origin: "playground",
    providerId: "groq",
    modelId: "openai/gpt-oss-120b",
    prompts: { systemPrompt: "", userPrompt: "hello" },
    state: "done",
    errorCategory: null,
    durationMs: 1_500,
    tokens: { inputTokens: 12, outputTokens: 4, source: "provider" },
    costMicros: 9,
    ...overrides,
  };
}

test("totals roll up every bucket and stay sticky about estimates", () => {
  const totals = usageTotals([
    aggregate(),
    aggregate({ day: "2026-08-16", runs: 1, inputTokens: 500, costMicros: 75 }),
  ]);

  assert.equal(totals.runs, 3);
  assert.equal(totals.inputTokens, 1_500);
  assert.equal(totals.outputTokens, 400);
  assert.equal(totals.costMicros, 345);
  assert.equal(totals.estimated, false);

  const mixed = usageTotals([aggregate(), aggregate({ estimated: true })]);
  assert.equal(mixed.estimated, true);
});

test("estimated figures are always flagged in words", () => {
  assert.equal(tokenSourceNote(false), null);
  assert.match(String(tokenSourceNote(true)), /Estimated/);
  assert.equal(runTokenSummary(run()), "12 in / 4 out");
  assert.equal(
    runTokenSummary(
      run({ tokens: { inputTokens: 12, outputTokens: 4, source: "estimated" } }),
    ),
    "~12 in / 4 out",
  );
});

test("cost formatting never rounds a real charge away to zero", () => {
  assert.equal(formatCostMicros(0), "$0.00");
  assert.equal(formatCostMicros(1), "< $0.001");
  assert.equal(formatCostMicros(2_500), "$0.003");
  assert.equal(formatCostMicros(1_500_000), "$1.50");
});

test("per-model rows merge days and sort by cost", () => {
  const rows = usageByModel([
    aggregate({ day: "2026-08-16" }),
    aggregate(),
    aggregate({ modelId: "openai/gpt-oss-20b", costMicros: 1_000, estimated: true }),
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.modelId, "openai/gpt-oss-20b");
  assert.equal(rows[0]?.estimated, true);
  assert.equal(rows[1]?.runs, 4);
  assert.equal(rows[1]?.costMicros, 540);
});

test("filter options come from what the history actually holds", () => {
  const options = runFilterOptions([
    aggregate(),
    aggregate({ providerId: "gemini", modelId: "gemini-2.5-flash" }),
  ]);

  assert.deepEqual(
    options.providers.map((option) => option.value),
    ["gemini", "groq"],
  );
  assert.equal(options.models.length, 2);

  const encoded = encodeModelFilter("groq", "openai/gpt-oss-120b");
  assert.deepEqual(decodeModelFilter(encoded), {
    providerId: "groq",
    modelId: "openai/gpt-oss-120b",
  });
  assert.equal(decodeModelFilter("no-separator"), null);
});

test("period windows and terminal labels", () => {
  const now = 30 * 86_400_000;
  assert.equal(usagePeriodStart("all", now), 0);
  assert.equal(usagePeriodStart("7d", now), now - 7 * 86_400_000);
  assert.equal(usagePeriodStart("30d", now), 0);

  assert.equal(runStateLabel("done"), "Done");
  assert.equal(runStateLabel("cancelled"), "Cancelled");
  assert.equal(runStateLabel("timed_out"), "Timed out");
  assert.equal(runStateLabel("failed"), "Failed");

  assert.equal(formatDuration(400), "400ms");
  assert.equal(formatDuration(1_500), "1.5s");
});
