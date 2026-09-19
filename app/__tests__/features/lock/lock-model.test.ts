import assert from "node:assert/strict";
import test from "node:test";
import type { NoteLockState } from "@skriuw/renderer-core/contracts/workspace";
import {
  formatWait,
  hintRevealsSecret,
  normalizeHint,
  retryWaitMs,
  unlockPresentation,
  validateHint,
  validateSecret,
} from "../../../src/features/lock/lock-model";

function lock(overrides: Partial<NoteLockState> = {}): NoteLockState {
  return {
    configured: true,
    unlocked: false,
    kind: "pin",
    hint: "the usual",
    failedAttempts: 0,
    nextAttemptAt: null,
    lockedNoteCount: 2,
    ...overrides,
  };
}

test("pins are digits with a floor and passphrases have a length floor", () => {
  assert.equal(validateSecret("pin", "1234"), null);
  assert.match(validateSecret("pin", "123") ?? "", /at least 4 digits/);
  assert.match(validateSecret("pin", "12a4") ?? "", /digits only/);
  assert.equal(validateSecret("passphrase", "open sesame"), null);
  assert.match(validateSecret("passphrase", "  ab  ") ?? "", /at least 6 characters/);
  assert.match(validateSecret("passphrase", "x".repeat(300)) ?? "", /under 256 bytes/);
});

test("hints are bounded, trimmed, and may not contain the secret", () => {
  assert.equal(validateHint("birthday"), null);
  assert.match(validateHint("h".repeat(121)) ?? "", /under 120/);
  assert.equal(normalizeHint("   "), null);
  assert.equal(normalizeHint("  my hint "), "my hint");
  assert.equal(hintRevealsSecret("it is 1234 backwards", "1234"), true);
  assert.equal(hintRevealsSecret("Open Sesame please", "open sesame"), true);
  assert.equal(hintRevealsSecret("birthday", "1234"), false);
  assert.equal(hintRevealsSecret("anything", ""), false);
});

test("the hint stays hidden until the first miss and waits are formatted", () => {
  const fresh = unlockPresentation(lock(), 1_000);
  assert.equal(fresh.showHint, false);
  assert.equal(fresh.throttled, false);
  assert.equal(fresh.attemptsLeftBeforeDelay, 3);

  const missed = unlockPresentation(lock({ failedAttempts: 1 }), 1_000);
  assert.equal(missed.showHint, true);
  assert.equal(missed.attemptsLeftBeforeDelay, 2);

  const throttled = unlockPresentation(
    lock({ failedAttempts: 3, nextAttemptAt: 31_000 }),
    1_000,
  );
  assert.equal(throttled.throttled, true);
  assert.equal(throttled.waitMs, 30_000);
  assert.equal(retryWaitMs(lock({ nextAttemptAt: 500 }), 1_000), 0);
  assert.equal(formatWait(30_000), "30 seconds");
  assert.equal(formatWait(1), "1 second");
  assert.equal(formatWait(120_000), "2 minutes");
  assert.equal(formatWait(61_000), "2 minutes");
});

test("a lock without a hint never shows one", () => {
  const presentation = unlockPresentation(lock({ hint: null, failedAttempts: 5 }), 0);
  assert.equal(presentation.showHint, false);
});
