import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  createQuickActionInbox,
  parseQuickActionType,
  QUICK_ACTION_TYPES,
  quickActionFromUrl,
  quickActionInbox,
} from "@/features/quick-actions/quick-actions";
import { redirectSystemPath } from "../../../../../../apps/mobile/app/+native-intent";
import { repositoryPath } from "../../../../../support/paths";

type DeclaredAction = { type: string; title: string; shortTitle: string };

function declaredActions(): DeclaredAction[] {
  return JSON.parse(
    readFileSync(repositoryPath("apps/mobile/src/features/quick-actions/actions.json"), "utf8"),
  );
}

test("the shortcuts the platforms declare are exactly the actions the app performs", () => {
  assert.deepEqual(
    declaredActions().map((action) => action.type),
    [...QUICK_ACTION_TYPES],
  );
});

test("every Android short label fits the launcher's 10 characters", () => {
  for (const action of declaredActions()) {
    assert.ok(action.shortTitle.length <= 10, `${action.type}: ${action.shortTitle}`);
    assert.ok(action.title.length <= 25, `${action.type}: ${action.title}`);
  }
});

test("only the actions this build knows are accepted", () => {
  assert.equal(parseQuickActionType("new-note"), "new-note");
  assert.equal(parseQuickActionType("capture"), "capture");
  assert.equal(parseQuickActionType("search"), "search");
  assert.equal(parseQuickActionType("compose"), null);
  assert.equal(parseQuickActionType(""), null);
});

test("an Android shortcut link names its action, and other links do not", () => {
  assert.equal(quickActionFromUrl("skriuw://quick-action/new-note"), "new-note");
  assert.equal(quickActionFromUrl("skriuw://quick-action/search/"), "search");
  assert.equal(quickActionFromUrl("/quick-action/capture"), "capture");
  assert.equal(quickActionFromUrl("skriuw://quick-action/unknown"), null);
  assert.equal(quickActionFromUrl("skriuw:///journal?day=2026-11-01"), null);
  assert.equal(quickActionFromUrl("skriuw:///notes/quick-action-ideas"), null);
});

test("the inbox keeps the latest action until it is taken", () => {
  const inbox = createQuickActionInbox();
  const notified: number[] = [];
  const stop = inbox.subscribe(() => notified.push(notified.length));

  inbox.deliver("capture");
  inbox.deliver("search");
  assert.equal(inbox.take(), "search");
  assert.equal(inbox.take(), null);

  stop();
  inbox.deliver("new-note");
  assert.equal(notified.length, 2);
});

test("a shortcut link becomes an action instead of a route", () => {
  assert.equal(redirectSystemPath({ path: "skriuw://quick-action/capture", initial: true }), "/");
  assert.equal(quickActionInbox.take(), "capture");

  assert.equal(redirectSystemPath({ path: "skriuw://quick-action/search", initial: false }), null);
  assert.equal(quickActionInbox.take(), "search");

  assert.equal(
    redirectSystemPath({ path: "skriuw:///journal", initial: false }),
    "skriuw:///journal",
  );
  assert.equal(quickActionInbox.take(), null);
});
