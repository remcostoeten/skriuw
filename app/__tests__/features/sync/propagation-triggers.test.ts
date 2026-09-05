import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPAGATION_FLUSH_DEBOUNCE_MS,
  bindPropagationTriggers,
  type PropagationTriggerDependencies,
} from "../../../src/features/sync/propagation-triggers";

type Listeners = Map<string, Set<() => void>>;

function eventSource(listeners: Listeners) {
  return {
    addEventListener: (type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  };
}

function fire(listeners: Listeners, type: string): void {
  for (const listener of listeners.get(type) ?? []) listener();
}

function harness() {
  const windowListeners: Listeners = new Map();
  const documentListeners: Listeners = new Map();
  const log: string[] = [];
  const timers = new Map<number, { callback: () => void; delayMs: number }>();
  let nextTimer = 1;
  const state = { visibilityState: "visible", focused: true, onLine: true };
  const deps: PropagationTriggerDependencies = {
    window: eventSource(windowListeners),
    document: {
      ...eventSource(documentListeners),
      get visibilityState() {
        return state.visibilityState;
      },
      hasFocus: () => state.focused,
    },
    navigator: {
      get onLine() {
        return state.onLine;
      },
    },
    flush: async () => {
      log.push("flush");
    },
    refresh: async () => {
      log.push("refresh");
      return { state: "upToDate" };
    },
    setOnline: async (online) => {
      log.push(`online:${online}`);
    },
    setVisibility: async (visible, focused) => {
      log.push(`visibility:${visible}:${focused}`);
    },
    timers: {
      setTimeout: (callback, delayMs) => {
        const handle = nextTimer;
        nextTimer += 1;
        timers.set(handle, { callback, delayMs });
        return handle;
      },
      clearTimeout: (handle) => {
        timers.delete(handle);
      },
    },
    onError: (context, error) => log.push(`error:${context}:${String(error)}`),
    debounceMs: PROPAGATION_FLUSH_DEBOUNCE_MS,
  };
  async function runTimers(): Promise<void> {
    const due = [...timers.values()];
    timers.clear();
    for (const timer of due) timer.callback();
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  }
  return { deps, log, state, timers, windowListeners, documentListeners, runTimers };
}

test("binding reports the initial visibility and connectivity", () => {
  const h = harness();
  const unbind = bindPropagationTriggers(h.deps);
  assert.deepEqual(h.log, ["visibility:true:true", "online:true"]);
  unbind();
});

test("blur and hidden flush pending work then refresh, coalesced by one trailing debounce", async () => {
  const h = harness();
  const unbind = bindPropagationTriggers(h.deps);
  h.log.length = 0;
  h.state.focused = false;
  fire(h.windowListeners, "blur");
  h.state.visibilityState = "hidden";
  fire(h.documentListeners, "visibilitychange");
  assert.equal(h.timers.size, 1, "the second trigger replaces the first timer");
  assert.equal([...h.timers.values()][0]?.delayMs, PROPAGATION_FLUSH_DEBOUNCE_MS);
  assert.deepEqual(h.log, ["visibility:true:false", "visibility:false:false"]);
  await h.runTimers();
  assert.deepEqual(h.log, [
    "visibility:true:false",
    "visibility:false:false",
    "flush",
    "refresh",
  ]);
  unbind();
});

test("a flush failure is reported but the refresh still runs", async () => {
  const h = harness();
  h.deps.flush = async () => {
    throw new Error("draft not durable");
  };
  const unbind = bindPropagationTriggers(h.deps);
  h.log.length = 0;
  fire(h.windowListeners, "blur");
  await h.runTimers();
  assert.deepEqual(h.log, [
    "visibility:true:true",
    "error:propagation flush:Error: draft not durable",
    "refresh",
  ]);
  unbind();
});

test("becoming visible or focused reports visibility without flushing", async () => {
  const h = harness();
  const unbind = bindPropagationTriggers(h.deps);
  h.log.length = 0;
  h.state.visibilityState = "visible";
  fire(h.documentListeners, "visibilitychange");
  fire(h.windowListeners, "focus");
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.log, ["visibility:true:true", "visibility:true:true"]);
  unbind();
});

test("online and offline forward the connectivity hint", () => {
  const h = harness();
  const unbind = bindPropagationTriggers(h.deps);
  h.log.length = 0;
  h.state.onLine = false;
  fire(h.windowListeners, "offline");
  h.state.onLine = true;
  fire(h.windowListeners, "online");
  assert.deepEqual(h.log, ["online:false", "online:true"]);
  unbind();
});

test("unbinding removes every listener and cancels a pending flush", async () => {
  const h = harness();
  const unbind = bindPropagationTriggers(h.deps);
  fire(h.windowListeners, "blur");
  assert.equal(h.timers.size, 1);
  unbind();
  assert.equal(h.timers.size, 0);
  h.log.length = 0;
  fire(h.windowListeners, "blur");
  fire(h.windowListeners, "online");
  fire(h.documentListeners, "visibilitychange");
  await h.runTimers();
  assert.deepEqual(h.log, []);
});
