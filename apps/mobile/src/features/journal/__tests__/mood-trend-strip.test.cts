import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import {
  flattenStyle,
  interactiveHosts,
  renderHosts,
} from "../../../shell/__tests__/native-host.cjs";
import { MINIMUM_TOUCH_TARGET } from "../../../shell/metrics";
import { formatLongDate, shiftDay, type DateKey } from "../dates";
import { moodTrend } from "../mood-trend";
import { MoodTrendStrip } from "../mood-trend-strip";

const today: DateKey = "2026-09-21";
const trend = moodTrend(
  [{ noteId: "n", dateKey: today, title: "", mood: "good", wordCount: 1 }],
  today,
);

function renderStrip(onSelectDay: (key: DateKey) => void = () => undefined) {
  return renderHosts(createElement(MoodTrendStrip, { trend, today, onSelectDay }));
}

function strip(onSelectDay?: (key: DateKey) => void) {
  const targets = interactiveHosts(renderStrip(onSelectDay));
  assert.equal(targets.length, 1, "the thirty days are one target, not thirty 10 pt ones");
  const [target] = targets;
  assert.ok(target);
  return target;
}

test("the strip is a single target at least 44 pt tall that spans the row", () => {
  const style = flattenStyle(strip().props.style);
  assert.ok(Number(style.height) >= MINIMUM_TOUCH_TARGET);
  assert.equal(style.width, undefined, "the strip stretches to the row's width");
});

test("a tap opens the day under the finger", () => {
  const opened: DateKey[] = [];
  const target = strip((key) => opened.push(key));
  (target.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: 300 } } });
  const press = target.props.onPress as (event: unknown) => void;

  press({ nativeEvent: { locationX: 2 } });
  press({ nativeEvent: { locationX: 155 } });
  press({ nativeEvent: { locationX: 299 } });
  press({ nativeEvent: { locationX: 340 } });

  assert.deepEqual(opened, [shiftDay(today, -29), shiftDay(today, -14), today, today]);
});

test("a screen reader meets one adjustable control announcing today", () => {
  const target = strip();
  assert.equal(target.props.accessibilityRole, "adjustable");
  assert.equal(target.props.accessibilityLabel, "Mood, last 30 days");
  assert.deepEqual(target.props.accessibilityValue, { text: `${formatLongDate(today)}, good` });
  const actions = (target.props.accessibilityActions as { name: string }[]).map(
    (action) => action.name,
  );
  assert.deepEqual(actions.sort(), ["activate", "decrement", "increment"]);
});

test("activating the strip from a screen reader opens the announced day", () => {
  const opened: DateKey[] = [];
  const target = strip((key) => opened.push(key));
  (target.props.onAccessibilityAction as (event: unknown) => void)({
    nativeEvent: { actionName: "activate" },
  });
  assert.deepEqual(opened, [today]);
});
