import assert from "node:assert/strict";
import test from "node:test";
import {
  ABOUT_LINKS,
  checkForUpdate,
  describeUpdateOutcome,
} from "../../../src/features/settings/about-model";

test("every about link points at an https destination", () => {
  assert.ok(ABOUT_LINKS.length > 0);
  for (const link of ABOUT_LINKS) {
    assert.ok(link.url.startsWith("https://"), `insecure ${link.id}`);
  }
});

test("about link ids are unique", () => {
  const ids = new Set(ABOUT_LINKS.map((link) => link.id));
  assert.equal(ids.size, ABOUT_LINKS.length);
});

test("update check reports the unconfigured state until a feed exists", async () => {
  const outcome = await checkForUpdate();
  assert.equal(outcome.status, "unconfigured");
  assert.match(describeUpdateOutcome(outcome), /aren’t set up/);
});

test("update outcomes each render a message", () => {
  assert.match(describeUpdateOutcome({ status: "upToDate" }), /latest/);
  assert.match(
    describeUpdateOutcome({ status: "available", version: "1.2.3" }),
    /1\.2\.3/,
  );
  assert.equal(
    describeUpdateOutcome({ status: "error", message: "network down" }),
    "network down",
  );
});
