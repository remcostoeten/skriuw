import assert from "node:assert/strict";
import test from "node:test";

import { createSkriuwCore, type NativeResult, type NativeSkriuwCore } from "../src/core";
import { SkriuwCoreError } from "../src/errors";

function succeed(value?: unknown): Promise<NativeResult> {
  return Promise.resolve({ ok: true, value });
}

function fail(error: unknown): Promise<NativeResult> {
  return Promise.resolve({ ok: false, error });
}

function fakeNative(overrides: Partial<NativeSkriuwCore> = {}): NativeSkriuwCore {
  return {
    protocolVersion: () => succeed(1),
    open: (slot) => succeed(`/data/workspaces/${slot}/skriuw.db`),
    bootstrap: () => succeed('{"notes":[]}'),
    submitOperations: () => succeed('{"applied":1}'),
    loadDocument: () => succeed('{"noteId":"note-1"}'),
    saveDocument: () => succeed('{"applied":1}'),
    shutdown: () => succeed(null),
    ...overrides,
  };
}

async function rejection(call: Promise<unknown>): Promise<SkriuwCoreError> {
  try {
    await call;
  } catch (error) {
    assert.ok(error instanceof SkriuwCoreError);
    return error;
  }
  throw new assert.AssertionError({ message: "expected the call to reject" });
}

test("every member of the surface answers with a promise", () => {
  const core = createSkriuwCore(fakeNative());
  const request = { noteId: "n", documentJson: "{}", markdown: "", expectedRevision: 0, at: 0 };

  assert.ok(core.protocolVersion() instanceof Promise);
  assert.ok(core.open() instanceof Promise);
  assert.ok(core.bootstrap() instanceof Promise);
  assert.ok(core.submitOperations("[]") instanceof Promise);
  assert.ok(core.loadDocument("n") instanceof Promise);
  assert.ok(core.saveDocument(request) instanceof Promise);
  assert.ok(core.shutdown() instanceof Promise);
});

test("open uses the default slot and reports the database path", async () => {
  const slots: string[] = [];
  const core = createSkriuwCore(
    fakeNative({
      open: (slot) => {
        slots.push(slot);
        return succeed(`/files/workspaces/${slot}/skriuw.db`);
      },
    }),
  );

  assert.deepEqual(await core.open(), {
    slot: "default",
    databasePath: "/files/workspaces/default/skriuw.db",
  });
  assert.deepEqual(await core.open("account-42"), {
    slot: "account-42",
    databasePath: "/files/workspaces/account-42/skriuw.db",
  });
  assert.deepEqual(slots, ["default", "account-42"]);
});

test("a slot that could escape the workspaces directory never reaches native code", async () => {
  let calls = 0;
  const core = createSkriuwCore(
    fakeNative({
      open: () => {
        calls += 1;
        return succeed("");
      },
    }),
  );

  for (const slot of ["", "../other", "a/b", "UPPER", ".hidden", "a".repeat(65)]) {
    const error = await rejection(core.open(slot));
    assert.equal(error.kind, "invalid-slot");
  }
  assert.equal(calls, 0);
});

test("payloads pass through as the contract JSON the core produced", async () => {
  const submitted: string[] = [];
  const core = createSkriuwCore(
    fakeNative({
      submitOperations: (operationsJson) => {
        submitted.push(operationsJson);
        return succeed('{"applied":2}');
      },
    }),
  );

  assert.equal(await core.bootstrap(), '{"notes":[]}');
  assert.equal(await core.submitOperations('[{"version":1}]'), '{"applied":2}');
  assert.deepEqual(submitted, ['[{"version":1}]']);
  assert.equal(await core.protocolVersion(), 1);
  assert.equal(await core.shutdown(), undefined);
});

test("a conflict keeps both revisions", async () => {
  const core = createSkriuwCore(
    fakeNative({
      saveDocument: () =>
        fail({
          kind: "conflict",
          message: "note-1 changed",
          id: "note-1",
          expected: 3,
          current: 5,
        }),
    }),
  );

  const error = await rejection(
    core.saveDocument({
      noteId: "note-1",
      documentJson: "{}",
      markdown: "",
      expectedRevision: 3,
      at: 1,
    }),
  );
  assert.equal(error.kind, "conflict");
  assert.equal(error.id, "note-1");
  assert.equal(error.expected, 3);
  assert.equal(error.current, 5);
  assert.equal(error.needsRecovery, false);
});

test("an open failure is the recovery surface", async () => {
  const core = createSkriuwCore(
    fakeNative({
      open: () => fail({ kind: "recovery", message: "database disk image is malformed" }),
    }),
  );

  const error = await rejection(core.open());
  assert.equal(error.kind, "recovery");
  assert.equal(error.needsRecovery, true);
  assert.equal(error.message, "database disk image is malformed");
});

test("busy is transient and an unsupported protocol carries its version", async () => {
  const core = createSkriuwCore(
    fakeNative({
      bootstrap: () => fail({ kind: "busy", message: "workspace is busy" }),
      submitOperations: () => fail({ kind: "unsupported-protocol", message: "v9", version: 9 }),
    }),
  );

  assert.equal((await rejection(core.bootstrap())).isTransient, true);
  const unsupported = await rejection(core.submitOperations("[]"));
  assert.equal(unsupported.kind, "unsupported-protocol");
  assert.equal(unsupported.version, 9);
});

test("failures this build cannot name stay visible as internal", async () => {
  const core = createSkriuwCore(
    fakeNative({
      bootstrap: () => fail({ kind: "quota-exceeded", message: "disk full" }),
      loadDocument: () => fail(null),
      shutdown: () => Promise.reject(new Error("module was destroyed")),
      submitOperations: () => Promise.resolve("not a result" as unknown as NativeResult),
      saveDocument: () => succeed(42),
    }),
  );

  const unknownKind = await rejection(core.bootstrap());
  assert.equal(unknownKind.kind, "internal");
  assert.match(unknownKind.message, /quota-exceeded/);
  assert.match(unknownKind.message, /disk full/);

  assert.equal((await rejection(core.loadDocument("n"))).kind, "internal");

  const rejected = await rejection(core.shutdown());
  assert.equal(rejected.kind, "internal");
  assert.equal(rejected.message, "module was destroyed");
  assert.ok(rejected.cause instanceof Error);

  assert.equal((await rejection(core.submitOperations("[]"))).kind, "internal");
  assert.equal(
    (
      await rejection(
        core.saveDocument({
          noteId: "n",
          documentJson: "{}",
          markdown: "",
          expectedRevision: 0,
          at: 0,
        }),
      )
    ).kind,
    "internal",
  );
});
