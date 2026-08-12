import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthConfiguration } from "../../../src/features/auth/config";

test("uses environment-appropriate defaults", () => {
  assert.deepEqual(resolveAuthConfiguration(undefined, true), {
    available: true,
    baseUrl: "http://localhost:8787",
  });
  assert.deepEqual(resolveAuthConfiguration(undefined, false), {
    available: true,
    baseUrl: "https://skriuw-v2-cloud.remcostoeten.workers.dev",
  });
});

test("accepts only CSP-approved production cloud hosts", () => {
  assert.deepEqual(resolveAuthConfiguration("https://auth.skriuw.app/path", false), {
    available: true,
    baseUrl: "https://auth.skriuw.app",
  });
  assert.equal(resolveAuthConfiguration("https://example.com", false).available, false);
  assert.equal(resolveAuthConfiguration("http://auth.skriuw.app", false).available, false);
});
