import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
const baseUrl = "http://127.0.0.1:4195";
const totalNotes = Number.parseInt(process.env.SKRIUW_SCALE_NOTES ?? "1000", 10);
if (!Number.isInteger(totalNotes) || totalNotes < 1 || totalNotes > 50_000) {
  throw new Error(`invalid SKRIUW_SCALE_NOTES: ${process.env.SKRIUW_SCALE_NOTES}`);
}
const resultsPath = join(appDirectory, "e2e", "results", `browser-scale-${totalNotes}.json`);
const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-browser-scale-"));
let server;
let browser;
let socket;

try {
  server = startViteServer(appDirectory, 4195);
  await waitForServer(server, baseUrl);
  const launched = await launchChrome(profileDirectory);
  browser = launched.child;
  const cdp = await connectCdp(launched.webSocketUrl);
  socket = cdp;
  const version = await cdp.send("Browser.getVersion");
  const { targetId } = await cdp.send("Target.createTarget", {
    url: `${baseUrl}/e2e/browser-scale.html`,
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await cdp.send("Runtime.enable", {}, sessionId);
  await waitFor(cdp, sessionId, "window.browserScaleE2e !== undefined", "scale module");

  const seed = await evaluate(
    cdp,
    sessionId,
    `window.browserScaleE2e.seed(${totalNotes}).then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }))`,
    600_000,
  );
  if (!seed.ok) throw new Error(`seeding failed: ${seed.error}`);

  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
  await delay(300);
  await waitFor(cdp, sessionId, "window.browserScaleE2e !== undefined", "reloaded scale module");
  const measure = await evaluate(
    cdp,
    sessionId,
    "window.browserScaleE2e.measure().then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }))",
    120_000,
  );
  if (!measure.ok) throw new Error(`measurement failed: ${measure.error}`);

  const expectedNodes = seed.value.initialNodes + seed.value.totalOperations;
  if (measure.value.nodes !== expectedNodes) {
    throw new Error(
      `expected ${expectedNodes} durable nodes after reload, found ${measure.value.nodes}`,
    );
  }
  if (measure.value.searchHits < 1) {
    throw new Error("seeded workspace produced no search hits");
  }

  const report = {
    browser: version.product,
    notes: totalNotes,
    seed: seed.value,
    measure: measure.value,
    recordedAt: new Date().toISOString(),
  };
  await writeFile(resultsPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    [
      `browser scale run (${version.product}, ${totalNotes} notes)`,
      `  first-open initialize+bootstrap: ${seed.value.initializeMs.toFixed(1)} ms (empty database)`,
      `  seed apply: ${seed.value.applyMs.toFixed(1)} ms across ${seed.value.batches} batches (${seed.value.totalOperations} operations)`,
      `  seeded reload bootstrap (worker init + open + hydrate): ${measure.value.coldBootstrapMs.toFixed(1)} ms`,
      `  warm bootstrap (open database, full snapshot): ${measure.value.warmBootstrapMs.toFixed(1)} ms`,
      `  search "topic-11" limit 20: ${measure.value.searchMs.toFixed(1)} ms, ${measure.value.searchHits} hits`,
      `  durable nodes verified: ${measure.value.nodes}, documents: ${measure.value.documents}`,
      `  results written to ${resultsPath}`,
      "",
    ].join("\n"),
  );
} finally {
  socket?.close();
  await stopProcess(browser, "SIGKILL");
  await stopProcess(server, "SIGTERM");
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
