import assert from "node:assert/strict";
import { test } from "vitest";
import { closedBubbleMenu } from "@/features/editor/menus/bubble";
import { closedLinkMenu, type LinkMenuState } from "@/features/editor/links/menu";
import { createEditorMenuStore } from "@/features/editor/menus/menu-store";

const openLink: LinkMenuState = {
  ...closedLinkMenu,
  open: true,
  href: "https://example.com",
  from: 4,
  to: 16,
  x: 240,
  y: 120,
};

test("setting an equal value notifies no subscriber and keeps the stored identity", () => {
  const menus = createEditorMenuStore();
  let notified = 0;
  menus.subscribe("link", () => {
    notified += 1;
  });
  menus.set("link", openLink);
  const stored = menus.get("link");
  menus.set("link", { ...openLink });
  assert.equal(notified, 1);
  assert.equal(menus.get("link"), stored);
});

test("a changed link state notifies link subscribers only", () => {
  const menus = createEditorMenuStore();
  let linkNotified = 0;
  let bubbleNotified = 0;
  menus.subscribe("link", () => {
    linkNotified += 1;
  });
  menus.subscribe("bubble", () => {
    bubbleNotified += 1;
  });
  menus.set("link", openLink);
  assert.equal(linkNotified, 1);
  assert.equal(bubbleNotified, 0);
  assert.equal(menus.get("link"), openLink);
  assert.equal(menus.get("bubble"), closedBubbleMenu);
});

test("the updater form receives the current value", () => {
  const menus = createEditorMenuStore();
  menus.set("link", openLink);
  let received: LinkMenuState | null = null;
  menus.set("link", (previous) => {
    received = previous;
    return { ...previous, editing: true };
  });
  assert.equal(received, openLink);
  assert.equal(menus.get("link").editing, true);
});

test("unsubscribing stops notifications", () => {
  const menus = createEditorMenuStore();
  let notified = 0;
  const unsubscribe = menus.subscribe("annotation", () => {
    notified += 1;
  });
  unsubscribe();
  menus.set("annotation", (previous) => ({ ...previous, open: true, threadId: "thread-1" }));
  assert.equal(notified, 0);
  assert.equal(menus.get("annotation").threadId, "thread-1");
});
