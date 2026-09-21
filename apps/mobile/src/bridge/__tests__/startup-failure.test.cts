import assert from "node:assert/strict";
import test from "node:test";
import { SkriuwCoreError } from "../../../modules/skriuw-core/src/errors";
import {
  createStartupFailureFlow,
  describeStartupFailure,
  isResettableFailure,
  type StartupFailureView,
} from "../startup-failure";

function select(view: StartupFailureView | undefined, label: string): void {
  const action = view?.actions.find((candidate) => candidate.label === label);
  assert.ok(action, `missing action ${label}`);
  action.onSelect();
}

test("a native kind survives being wrapped in a cause chain", () => {
  const coreError = new SkriuwCoreError({ kind: "recovery", message: "not a workspace" });
  const failure = describeStartupFailure(new Error("startup failed", { cause: coreError }));
  assert.deepEqual(failure, { code: "recovery", message: "not a workspace", recovery: null });
  assert.equal(isResettableFailure(failure), true);
});

test("a newer database and a busy workspace are never offered a reset", () => {
  for (const kind of ["unsupported-protocol", "busy", "slot-in-use"] as const) {
    const failure = describeStartupFailure(new SkriuwCoreError({ kind, message: kind }));
    assert.equal(isResettableFailure(failure), false);
    assert.notEqual(failure.recovery, null);
  }
  assert.equal(isResettableFailure(describeStartupFailure(new Error("plain"))), false);
});

test("the reset is confirmed, runs once and restarts through the port", async () => {
  const views: StartupFailureView[] = [];
  let resets = 0;
  let settle: () => void = () => undefined;
  const flow = createStartupFailureFlow({
    resetWorkspace: () => {
      resets += 1;
      return new Promise<void>((resolve) => {
        settle = resolve;
      });
    },
    retry: () => undefined,
    render: (view) => views.push(view),
  });

  flow.show({ code: "workspace", message: "migration failed", recovery: null });
  assert.deepEqual(
    views.at(-1)?.actions.map((action) => action.label),
    ["Retry", "Reset workspace…"],
  );

  select(views.at(-1), "Reset workspace…");
  select(views.at(-1), "Delete and restart");
  assert.equal(
    views.at(-1)?.actions.every((action) => action.disabled),
    true,
  );
  select(views.at(-1), "Delete and restart");
  assert.equal(resets, 1);
  settle();
});

test("a rejected reset returns to a visible failure", async () => {
  const views: StartupFailureView[] = [];
  const reported: unknown[] = [];
  const flow = createStartupFailureFlow({
    resetWorkspace: () => Promise.reject(new Error("unlink failed")),
    retry: () => undefined,
    render: (view) => views.push(view),
    reportError: (error) => reported.push(error),
  });

  flow.show({ code: "recovery", message: "corrupt", recovery: null });
  select(views.at(-1), "Reset workspace…");
  select(views.at(-1), "Delete and restart");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(views.at(-1)?.detail, "Skriuw could not delete the workspace on this device.");
  assert.equal(reported.length, 1);
});

test("without a reset capability only retry is offered", () => {
  const views: StartupFailureView[] = [];
  let retries = 0;
  const flow = createStartupFailureFlow({
    resetWorkspace: null,
    retry: () => {
      retries += 1;
    },
    render: (view) => views.push(view),
  });

  flow.show({ code: "recovery", message: "corrupt", recovery: null });
  assert.deepEqual(
    views.at(-1)?.actions.map((action) => action.label),
    ["Retry"],
  );
  select(views.at(-1), "Retry");
  assert.equal(retries, 1);
});

test("a late reset rejection does not replace a newer failure", async () => {
  const views: StartupFailureView[] = [];
  let rejectReset: (error: Error) => void = () => undefined;
  const flow = createStartupFailureFlow({
    resetWorkspace: () =>
      new Promise<void>((_resolve, reject) => {
        rejectReset = reject;
      }),
    retry: () => undefined,
    render: (view) => views.push(view),
  });

  flow.show({ code: "recovery", message: "corrupt", recovery: null });
  select(views.at(-1), "Reset workspace…");
  select(views.at(-1), "Delete and restart");
  flow.show({ code: "unsupported-protocol", message: "update required", recovery: null });
  rejectReset(new Error("unlink failed"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(views.at(-1)?.detail, "update required");
});
