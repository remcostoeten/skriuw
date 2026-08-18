import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PLAN_ITEMS,
  keptPlanItems,
  parseActionPlan,
  parseTagPlan,
  parseTaskPlan,
  planApplyError,
} from "../../../src/features/ai/action-plan";

function items(output: string): readonly string[] {
  const plan = parseTaskPlan(output);
  assert.ok(plan.ok, "expected a usable task plan");
  return plan.items.map((item) => item.text);
}

test("task lines survive bullets, numbers, and checkboxes", () => {
  assert.deepEqual(items("- Call the printer\n* Send the invoice\n1. Book the room"), [
    "Call the printer",
    "Send the invoice",
    "Book the room",
  ]);
  assert.deepEqual(items("- [ ] Water the plants\n- [x] Buy milk"), [
    "Water the plants",
    "Buy milk",
  ]);
});

test("task plans drop blanks, trailing punctuation, and duplicates", () => {
  assert.deepEqual(items("- Ship it.\n\n- ship IT\n-   \n- Ship it,"), ["Ship it"]);
});

test("output with no usable lines is refused instead of guessed at", () => {
  const plan = parseTaskPlan("   \n\n  ");
  assert.equal(plan.ok, false);
  assert.match(plan.ok ? "" : plan.message, /did not return a usable list/);
});

test("an over-long plan is refused rather than quietly clipped", () => {
  const output = Array.from({ length: MAX_PLAN_ITEMS + 1 }, (_, index) => `- task ${index}`).join(
    "\n",
  );
  const plan = parseTaskPlan(output);
  assert.equal(plan.ok, false);
  assert.match(plan.ok ? "" : plan.message, /the limit is 50/);
  const atLimit = parseTaskPlan(
    Array.from({ length: MAX_PLAN_ITEMS }, (_, index) => `- task ${index}`).join("\n"),
  );
  assert.equal(atLimit.ok, true);
});

test("tag names lose their hash and their interior spaces", () => {
  const plan = parseTagPlan("- #Recipes\n- home cooking\n- #recipes");
  assert.ok(plan.ok);
  assert.deepEqual(
    plan.items.map((item) => item.text),
    ["Recipes", "home-cooking"],
  );
});

test("a tag longer than the name bound is dropped, not truncated", () => {
  const plan = parseTagPlan(`- ok\n- ${"x".repeat(65)}`);
  assert.ok(plan.ok);
  assert.deepEqual(
    plan.items.map((item) => item.text),
    ["ok"],
  );
});

test("parseActionPlan routes each outcome to its own reader", () => {
  const tasks = parseActionPlan("tasks", "- #ship it");
  assert.ok(tasks.ok);
  assert.equal(tasks.items[0]?.text, "#ship it");
  const tags = parseActionPlan("tags", "- #ship it");
  assert.ok(tags.ok);
  assert.equal(tags.items[0]?.text, "ship-it");
});

test("unticked items leave the plan and an empty plan refuses to apply", () => {
  const plan = parseTaskPlan("- one\n- two");
  assert.ok(plan.ok);
  const kept = keptPlanItems(plan.items, new Set(["one"]));
  assert.deepEqual(
    kept.map((item) => item.text),
    ["two"],
  );
  assert.equal(planApplyError("tasks", kept), null);
  assert.equal(
    planApplyError("tasks", keptPlanItems(plan.items, new Set(["one", "two"]))),
    "Choose at least one task to add.",
  );
  assert.equal(planApplyError("tags", []), "Choose at least one tag to add.");
});
