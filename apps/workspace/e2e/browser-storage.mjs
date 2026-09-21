import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  connectCdp,
  delay,
  evaluate,
  launchChrome,
  startViteServer,
  stopProcess,
  waitFor,
  waitForServer,
} from "./chrome-harness.mjs";

const appDirectory = new URL("..", import.meta.url).pathname;
const baseUrl = "http://127.0.0.1:4193";
const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-browser-opfs-"));
let server;
let browser;
let socket;

try {
  server = startViteServer(appDirectory, 4193);
  await waitForServer(server, baseUrl);
  const launched = await launchChrome(profileDirectory);
  browser = launched.child;
  const cdp = await connectCdp(launched.webSocketUrl);
  socket = cdp;
  const { targetId } = await cdp.send("Target.createTarget", {
    url: `${baseUrl}/e2e/browser-storage.html`,
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await cdp.send("Runtime.enable", {}, sessionId);
  await waitFor(cdp, sessionId, "window.browserStorageE2e !== undefined", "test module");

  const result = await evaluate(
    cdp,
    sessionId,
    "window.browserStorageE2e.write().then(value => ({ ok: true, value }), error => ({ ok: false, error }))",
  );
  if (!result.ok) throw new Error(`browser write failed: ${JSON.stringify(result.error)}`);

  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
  await delay(300);
  await waitFor(cdp, sessionId, "window.browserStorageE2e !== undefined", "reloaded test module");
  const reopened = await evaluate(
    cdp,
    sessionId,
    `window.browserStorageE2e.count(${JSON.stringify(result.value.id)})`,
  );
  if (reopened !== 1) {
    throw new Error(`expected one durable folder after reopen, found ${reopened}`);
  }

  const roundTrip = await evaluate(
    cdp,
    sessionId,
    "window.browserStorageE2e.archiveRoundTrip().then(value => ({ ok: true, value }), error => ({ ok: false, error }))",
  );
  if (!roundTrip.ok) {
    throw new Error(`archive round trip failed: ${JSON.stringify(roundTrip.error)}`);
  }
  if (roundTrip.value.markerCopies !== 1 || roundTrip.value.extraCopies !== 0) {
    throw new Error(
      `archive import did not restore the exported state: ${JSON.stringify(roundTrip.value)}`,
    );
  }

  const search = await evaluate(
    cdp,
    sessionId,
    "window.browserStorageE2e.contentSearch().then(value => ({ ok: true, value }), error => ({ ok: false, error }))",
  );
  if (!search.ok) {
    throw new Error(`content search failed: ${JSON.stringify(search.error)}`);
  }
  if (search.value.hits !== 1 || !search.value.snippet.includes("<mark>")) {
    throw new Error(
      `browser FTS5 did not return a highlighted content hit: ${JSON.stringify(search.value)}`,
    );
  }
  if (search.value.diacriticHits !== 1) {
    throw new Error("browser FTS5 did not fold diacritics");
  }
  if (search.value.opaqueHits !== 0) {
    throw new Error("browser FTS5 indexed an opaque drawing payload");
  }
  if (search.value.rebuiltHits !== 1 || search.value.needsRebuildAfter) {
    throw new Error(
      `browser search index rebuild was not idempotent: ${JSON.stringify(search.value)}`,
    );
  }

  const rejection = await evaluate(
    cdp,
    sessionId,
    "window.browserStorageE2e.invalidArchiveRejected().then(value => ({ ok: true, value }), error => ({ ok: false, error }))",
  );
  if (!rejection.ok) {
    throw new Error(`invalid archive check failed: ${JSON.stringify(rejection.error)}`);
  }
  if (rejection.value.code !== "invalid_request") {
    throw new Error(
      `invalid archive was not rejected with invalid_request: ${JSON.stringify(rejection.value)}`,
    );
  }

  process.stdout.write(
    `browser OPFS durability passed: ${result.value.initialNodes} initial nodes, one persisted write, archive round trip restored, FTS5 content search and rebuild verified\n`,
  );
} finally {
  socket?.close();
  await stopProcess(browser, "SIGKILL");
  await stopProcess(server, "SIGTERM");
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
