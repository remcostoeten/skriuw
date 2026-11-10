import assert from "node:assert/strict";
import { test } from "vitest";
import {
  checkForUpdate,
  describeUpdateOutcome,
  downloadPercentage,
  installPendingUpdate,
} from "@/features/updates/updater";

test("update check is unsupported outside the desktop shell", async () => {
  const outcome = await checkForUpdate();
  assert.equal(outcome.status, "unsupported");
  assert.match(describeUpdateOutcome(outcome), /desktop app/);
});

test("installing without a found update asks for a new check", async () => {
  await assert.rejects(
    installPendingUpdate(() => {}),
    /Check for updates again/,
  );
});

test("update outcomes each render a message", () => {
  assert.match(describeUpdateOutcome({ status: "upToDate" }), /latest/);
  assert.match(describeUpdateOutcome({ status: "available", version: "1.2.3" }), /1\.2\.3/);
  assert.equal(describeUpdateOutcome({ status: "error", message: "network down" }), "network down");
});

test("download percentage is unknown until the size is known", () => {
  assert.equal(downloadPercentage({ downloadedBytes: 10, totalBytes: null }), null);
  assert.equal(downloadPercentage({ downloadedBytes: 0, totalBytes: 0 }), null);
  assert.equal(downloadPercentage({ downloadedBytes: 512, totalBytes: 1024 }), 50);
  assert.equal(downloadPercentage({ downloadedBytes: 2048, totalBytes: 1024 }), 100);
});
