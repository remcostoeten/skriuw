import assert from "node:assert/strict";
import { test } from "vitest";
import { createLedgerRegistry } from "@/shared/ui/settings-ledger";

const FOLLOWING = 4;
const PRECEDING = 2;

(globalThis as any).Node ??= {
  DOCUMENT_POSITION_FOLLOWING: FOLLOWING,
  DOCUMENT_POSITION_PRECEDING: PRECEDING,
};

function element(position: number): HTMLElement {
  return {
    position,
    compareDocumentPosition(other: { position: number }) {
      if (other.position > position) return FOLLOWING;
      if (other.position < position) return PRECEDING;
      return 0;
    },
  } as any;
}

test("the outline lists groups in page order, whatever order they mount in", () => {
  const registry = createLedgerRegistry();
  registry.register({ id: "preferences", title: "Preferences", element: element(3) });
  registry.register({ id: "theme", title: "Theme", element: element(1) });
  registry.register({ id: "sidebar", title: "Sidebar", element: element(2) });
  assert.deepEqual(
    registry.snapshot().map((group) => group.id),
    ["theme", "sidebar", "preferences"],
  );
});

test("a group that unmounts leaves the outline and listeners hear about it", () => {
  const registry = createLedgerRegistry();
  let notified = 0;
  registry.subscribe(() => {
    notified += 1;
  });
  const unregister = registry.register({ id: "remove", title: "Remove", element: element(1) });
  registry.register({ id: "relocking", title: "Relocking", element: element(0) });
  unregister();
  assert.deepEqual(
    registry.snapshot().map((group) => group.id),
    ["relocking"],
  );
  assert.equal(notified, 3);
});

test("registering a group again replaces it instead of listing it twice", () => {
  const registry = createLedgerRegistry();
  registry.register({ id: "theme", title: "Theme", element: element(1) });
  registry.register({ id: "theme", title: "Theme", element: element(1) });
  assert.equal(registry.snapshot().length, 1);
});
