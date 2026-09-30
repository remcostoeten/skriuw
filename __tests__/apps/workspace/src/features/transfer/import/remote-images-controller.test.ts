import assert from "node:assert/strict";
import { test } from "vitest";
import {
  registerRemoteImagePromptListener,
  requestRemoteImageChoice,
} from "@/features/transfer/import/remote-images-controller";

test("without a mounted prompt the choice resolves null", async () => {
  assert.equal(await requestRemoteImageChoice(["https://a.test/x.svg"]), null);
});

test("the mounted prompt receives the image addresses and answers the request", async () => {
  const unregister = registerRemoteImagePromptListener((request) => {
    assert.deepEqual(request.sources, ["https://a.test/x.svg", "https://b.test/y.png"]);
    request.resolve("download");
  });
  assert.equal(
    await requestRemoteImageChoice(["https://a.test/x.svg", "https://b.test/y.png"]),
    "download",
  );
  unregister();
  assert.equal(
    await requestRemoteImageChoice(["https://a.test/x.svg", "https://b.test/y.png"]),
    null,
  );
});
