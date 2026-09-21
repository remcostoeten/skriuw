import assert from "node:assert/strict";
import test from "node:test";
import {
  createStartupFailureFlow,
  describeStartupFailure,
  isResettableFailure,
  type StartupFailure,
  type StartupFailureFlowPort,
  type StartupFailureView,
} from "../../src/shell/startup-failure";

function corruptFailure(): StartupFailure {
  return {
    code: "corrupt_database",
    message: "The workspace database is damaged.",
    recovery: "Reload Skriuw.",
  };
}

function harness(overrides: Partial<StartupFailureFlowPort> = {}) {
  const views: StartupFailureView[] = [];
  const errors: unknown[] = [];
  let retries = 0;
  const port: StartupFailureFlowPort = {
    browserRuntime: true,
    resetWorkspace: async () => {},
    retry: () => {
      retries += 1;
    },
    render: (view) => views.push(view),
    reportError: (error) => errors.push(error),
    ...overrides,
  };
  return {
    flow: createStartupFailureFlow(port),
    views,
    errors,
    retries: () => retries,
    latest: () => views[views.length - 1]!,
    press: (label: string) => {
      const action = views[views.length - 1]!.actions.find((candidate) => candidate.label === label);
      assert.ok(action, `no ${label} action on screen`);
      assert.equal(action.disabled ?? false, false, `${label} is disabled`);
      action.onSelect();
    },
  };
}

test("a plain worker failure record keeps its code, message and recovery", () => {
  const described = describeStartupFailure({
    code: "corrupt_database",
    message: "damaged",
    recovery: "reload",
    terminal: true,
  });
  assert.deepEqual(described, {
    code: "corrupt_database",
    message: "damaged",
    recovery: "reload",
  });
});

test("a coded failure without a message is still named by its code", () => {
  assert.deepEqual(describeStartupFailure({ code: "open_failed" }), {
    code: "open_failed",
    message: "Browser storage failed (open_failed).",
    recovery: null,
  });
});

test("a code survives being wrapped in an Error cause", () => {
  const wrapped = new Error("workspace bootstrap failed", {
    cause: { code: "worker_crashed", message: "the storage worker stopped", recovery: "reload" },
  });
  assert.deepEqual(describeStartupFailure(wrapped), {
    code: "worker_crashed",
    message: "the storage worker stopped",
    recovery: "reload",
  });
});

test("a self-referencing cause chain terminates instead of hanging", () => {
  const looped: { message: string; cause?: unknown } = { message: "boom" };
  looped.cause = looped;
  assert.deepEqual(describeStartupFailure(looped), {
    code: null,
    message: "boom",
    recovery: null,
  });
});

test("an uncoded Error and a non-object rejection both describe as codeless", () => {
  assert.deepEqual(describeStartupFailure(new Error("disk on fire")), {
    code: null,
    message: "disk on fire",
    recovery: null,
  });
  assert.deepEqual(describeStartupFailure("nope"), {
    code: null,
    message: "nope",
    recovery: null,
  });
});

test("only terminal open-path codes are resettable, and only in the browser", () => {
  for (const code of ["corrupt_database", "migration_failed", "open_failed", "worker_crashed"]) {
    assert.equal(isResettableFailure({ code, message: "", recovery: null }, true), true, code);
  }
  for (const code of ["already_open", "database_too_new", "quota_exceeded", "shutdown"]) {
    assert.equal(isResettableFailure({ code, message: "", recovery: null }, true), false, code);
  }
  assert.equal(isResettableFailure({ code: null, message: "", recovery: null }, true), false);
  assert.equal(isResettableFailure(corruptFailure(), false), false);
});

test("the desktop runtime never offers to delete the workspace", () => {
  const desktop = harness({ browserRuntime: false });
  desktop.flow.show(corruptFailure());
  assert.deepEqual(
    desktop.latest().actions.map((action) => action.label),
    ["Retry"],
  );
});

test("a retryable failure offers retry only, and retry reaches the caller", () => {
  const app = harness();
  app.flow.show({ code: "quota_exceeded", message: "no space", recovery: null });
  assert.deepEqual(
    app.latest().actions.map((action) => action.label),
    ["Retry"],
  );
  app.press("Retry");
  assert.equal(app.retries(), 1);
});

test("the reset is confirmed before anything is deleted, and cancel returns to the failure", () => {
  let resets = 0;
  const app = harness({
    resetWorkspace: async () => {
      resets += 1;
    },
  });
  app.flow.show(corruptFailure());

  app.press("Reset workspace…");
  assert.equal(app.latest().title, "Delete this browser workspace?");
  assert.equal(resets, 0);

  app.press("Cancel");
  assert.equal(app.latest().title, "Skriuw could not open your workspace");
  assert.equal(app.latest().detail, corruptFailure().message);
  assert.equal(resets, 0);
});

test("a reset in flight disables both confirmation buttons and cannot be started twice", async () => {
  let resets = 0;
  let finishReset: (() => void) | null = null;
  const app = harness({
    resetWorkspace: () =>
      new Promise<void>((resolve) => {
        resets += 1;
        finishReset = resolve;
      }),
  });
  app.flow.show(corruptFailure());
  app.press("Reset workspace…");

  const confirm = app.latest().actions.find((action) => action.label === "Delete and reload")!;
  confirm.onSelect();
  await Promise.resolve();

  assert.equal(resets, 1);
  const pending = app.latest();
  assert.equal(pending.title, "Delete this browser workspace?");
  assert.ok(pending.actions.every((action) => action.disabled === true));

  confirm.onSelect();
  await Promise.resolve();
  assert.equal(resets, 1);

  assert.ok(finishReset);
  finishReset();
});

test("a successful reset leaves the confirmation up because the bridge reloads the tab", async () => {
  const app = harness();
  app.flow.show(corruptFailure());
  app.press("Reset workspace…");
  app.press("Delete and reload");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.latest().title, "Delete this browser workspace?");
});

test("a rejected reset reports the error and offers the manual browser fallback", async () => {
  const app = harness({
    resetWorkspace: async () => {
      throw new Error("OPFS removeEntry failed");
    },
  });
  app.flow.show(corruptFailure());
  app.press("Reset workspace…");
  app.press("Delete and reload");
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(app.errors.length, 1);
  assert.match(String(app.errors[0]), /OPFS removeEntry failed/);
  const failed = app.latest();
  assert.equal(failed.title, "Skriuw could not open your workspace");
  assert.equal(failed.detail, "Skriuw could not delete the browser workspace.");
  assert.match(failed.hint ?? "", /Clear this site's data/);
  assert.deepEqual(
    failed.actions.map((action) => action.label),
    ["Retry", "Reset workspace…"],
  );
});

test("a rejected reset can be retried from the failure screen", async () => {
  let attempts = 0;
  const app = harness({
    resetWorkspace: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("transient");
      }
    },
  });
  app.flow.show(corruptFailure());
  app.press("Reset workspace…");
  app.press("Delete and reload");
  await Promise.resolve();
  await Promise.resolve();

  app.press("Reset workspace…");
  app.press("Delete and reload");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(attempts, 2);
});

test("showing a later failure clears the in-flight reset state", async () => {
  let finishReset: (() => void) | null = null;
  const app = harness({
    resetWorkspace: () =>
      new Promise<void>((resolve) => {
        finishReset = resolve;
      }),
  });
  app.flow.show(corruptFailure());
  app.press("Reset workspace…");
  app.press("Delete and reload");
  await Promise.resolve();

  app.flow.show(corruptFailure());
  app.press("Reset workspace…");
  assert.ok(app.latest().actions.every((action) => (action.disabled ?? false) === false));

  assert.ok(finishReset);
  finishReset();
});
