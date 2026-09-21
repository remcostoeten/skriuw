import assert from "node:assert/strict";
import test from "node:test";
import {
  claimWorkspaceTab,
  holdWorkspaceTab,
  watchWorkspaceRelease,
  type TabLockChannel,
  type TabLockMessage,
} from "../../src/shell/workspace-tab-lock";

type Listener = (message: TabLockMessage) => void;

/** Mirrors `BroadcastChannel`: every endpoint but the sender sees a message. */
function createHub(): { connect: () => TabLockChannel } {
  const endpoints: Array<Set<Listener>> = [];
  return {
    connect: () => {
      const own = new Set<Listener>();
      endpoints.push(own);
      return {
        post: (message) => {
          for (const endpoint of endpoints) {
            if (endpoint === own) {
              continue;
            }
            for (const listener of [...endpoint]) {
              listener(message);
            }
          }
        },
        subscribe: (listener) => {
          own.add(listener);
          return () => own.delete(listener);
        },
      };
    },
  };
}

test("a claim makes the holder yield and then announce the release", async () => {
  const hub = createHub();
  const holder = hub.connect();
  const waiter = hub.connect();
  const order: string[] = [];
  holdWorkspaceTab(holder, async () => {
    order.push("yielded");
  });
  watchWorkspaceRelease(waiter, () => order.push("released"));

  await claimWorkspaceTab(waiter, 1_000);

  assert.deepEqual(order, ["yielded", "released"]);
});

test("the release only goes out after the holder has let go", async () => {
  const hub = createHub();
  const holder = hub.connect();
  const waiter = hub.connect();
  let letGo = false;
  let sawReleaseBeforeLetGo = false;
  holdWorkspaceTab(holder, async () => {
    await Promise.resolve();
    letGo = true;
  });
  watchWorkspaceRelease(waiter, () => {
    if (!letGo) {
      sawReleaseBeforeLetGo = true;
    }
  });

  await claimWorkspaceTab(waiter, 1_000);

  assert.equal(letGo, true);
  assert.equal(sawReleaseBeforeLetGo, false);
});

test("a claim resolves on timeout when no tab holds the workspace", async () => {
  const hub = createHub();
  const waiter = hub.connect();
  hub.connect();

  await claimWorkspaceTab(waiter, 5);

  assert.ok(true);
});

test("a holder yields once even when several tabs claim at the same time", async () => {
  const hub = createHub();
  const holder = hub.connect();
  const first = hub.connect();
  const second = hub.connect();
  let yields = 0;
  holdWorkspaceTab(holder, async () => {
    yields += 1;
  });

  await Promise.all([claimWorkspaceTab(first, 1_000), claimWorkspaceTab(second, 1_000)]);

  assert.equal(yields, 1);
});

test("a failed handover leaves the holder able to yield on a later claim", async () => {
  const hub = createHub();
  const holder = hub.connect();
  const waiter = hub.connect();
  let attempts = 0;
  holdWorkspaceTab(holder, async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("flush failed");
    }
  });

  await claimWorkspaceTab(waiter, 5);
  await claimWorkspaceTab(waiter, 1_000);

  assert.equal(attempts, 2);
});

test("unbinding the holder stops it answering claims", async () => {
  const hub = createHub();
  const holder = hub.connect();
  const waiter = hub.connect();
  let yields = 0;
  const unbind = holdWorkspaceTab(holder, async () => {
    yields += 1;
  });
  unbind();

  await claimWorkspaceTab(waiter, 5);

  assert.equal(yields, 0);
});
