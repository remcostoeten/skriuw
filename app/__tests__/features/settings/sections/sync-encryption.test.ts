import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceEncryptionState, WorkspaceSyncStatus } from "../../../../src/bridge/commands";
import {
  canEnableEncryption,
  encryptionDescription,
  encryptionKeyRequired,
  encryptionStage,
  normalizeRecoveryCodeInput,
  recoveryCodeLooksComplete,
} from "../../../../src/features/settings/sections/sync-encryption";

const UP_TO_DATE: WorkspaceSyncStatus = { state: "upToDate" };

function state(overrides: Partial<WorkspaceEncryptionState> = {}): WorkspaceEncryptionState {
  return {
    enabled: false,
    linked: true,
    keyId: null,
    sealedCheckpointAt: null,
    ...overrides,
  };
}

test("an unlinked workspace has nothing to encrypt", () => {
  assert.equal(encryptionStage(null, UP_TO_DATE, null), "unlinked");
  assert.equal(encryptionStage(state({ linked: false }), UP_TO_DATE, null), "unlinked");
  assert.equal(canEnableEncryption(state({ linked: false }), UP_TO_DATE), false);
});

test("a linked plaintext workspace offers encryption", () => {
  assert.equal(encryptionStage(state(), UP_TO_DATE, null), "off");
  assert.equal(canEnableEncryption(state(), UP_TO_DATE), true);
  assert.match(encryptionDescription("off"), /readable by the sync service/);
});

test("a freshly revealed recovery code outranks every other stage", () => {
  assert.equal(encryptionStage(state({ enabled: true }), UP_TO_DATE, "AAAA-BBBB"), "revealed");
  assert.match(encryptionDescription("revealed"), /never shown again/);
});

test("a device holding the key reads as encrypted", () => {
  assert.equal(
    encryptionStage(state({ enabled: true, keyId: "0f1e2d3c4b5a6978" }), UP_TO_DATE, null),
    "on",
  );
  assert.equal(canEnableEncryption(state({ enabled: true }), UP_TO_DATE), false);
});

test("a keyless device parked by the cycle asks for the recovery code", () => {
  const blocked: WorkspaceSyncStatus = {
    state: "blocked",
    reason: "encryption_key_required",
    detail: "another device encrypted this workspace",
  };
  assert.equal(encryptionKeyRequired(blocked), true);
  assert.equal(encryptionStage(state(), blocked, null), "locked");
  assert.match(encryptionDescription("locked"), /recovery code/);

  const unreadable: WorkspaceSyncStatus = {
    state: "blocked",
    reason: "sealed_content_unreadable",
    detail: null,
  };
  assert.equal(encryptionKeyRequired(unreadable), true);
  assert.equal(encryptionStage(state(), unreadable, null), "locked");
});

test("an unrelated blocked reason is not an encryption problem", () => {
  const blocked: WorkspaceSyncStatus = {
    state: "blocked",
    reason: "rejected_batch",
    detail: null,
  };
  assert.equal(encryptionKeyRequired(blocked), false);
  assert.equal(encryptionStage(state(), blocked, null), "off");
});

test("typed recovery codes are regrouped and bounded", () => {
  assert.equal(
    normalizeRecoveryCodeInput("0123456789abcdefghjkmnpqrstvwxyz"),
    "0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ",
  );
  assert.equal(normalizeRecoveryCodeInput("  0123 4567  "), "0123-4567");
  assert.equal(
    normalizeRecoveryCodeInput("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ-EXTRA").length,
    39,
  );
});

test("only a complete code enables the unlock action", () => {
  assert.equal(recoveryCodeLooksComplete("0123-4567"), false);
  assert.equal(
    recoveryCodeLooksComplete("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ"),
    true,
  );
});
