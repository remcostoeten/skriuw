import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appDirectory = new URL("..", import.meta.url).pathname;
const baseUrl = "http://127.0.0.1:4195";
const chromeBinary = process.env.CHROME_BINARY ?? "google-chrome-stable";
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
  server = spawn("bun", ["x", "vite", "--host", "127.0.0.1", "--port", "4195"], {
    cwd: appDirectory,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(server);
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

async function waitForServer(child) {
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before readiness (${child.exitCode})\n${stderr}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(100);
  }
  throw new Error(`Vite did not become ready\n${stderr}`);
}

function launchChrome(profile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      chromeBinary,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let output = "";
    const timeout = setTimeout(() => rejectLaunch("Chrome did not expose DevTools"), 15_000);
    let settled = false;
    function rejectLaunch(message) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGKILL");
      reject(new Error(`${message}\n${output}`));
    }
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (!settled && match?.[1]) {
        settled = true;
        clearTimeout(timeout);
        resolve({ child, webSocketUrl: match[1] });
      }
    });
    child.on("error", (error) => rejectLaunch(String(error)));
    child.on("exit", (code) => rejectLaunch(`Chrome exited early (${code})`));
  });
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const connection = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    connection.addEventListener("open", () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          connection.send(
            JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
          );
          return new Promise((resolveCall, rejectCall) => {
            pending.set(id, { resolveCall, rejectCall, method });
          });
        },
        close() {
          connection.close();
        },
      });
    });
    connection.addEventListener("error", () => reject(new Error("CDP connection failed")));
    connection.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === undefined) return;
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call?.rejectCall(new Error(`${call.method}: ${message.error.message}`));
      else call?.resolveCall(message.result);
    });
  });
}

async function evaluate(cdp, sessionId, expression, timeoutMs = 30_000) {
  const result = await Promise.race([
    cdp.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    ),
    delay(timeoutMs).then(() => {
      throw new Error(`evaluation timed out after ${timeoutMs} ms`);
    }),
  ]);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(cdp, sessionId, expression, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await evaluate(cdp, sessionId, expression)) return;
    await delay(50);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopProcess(child, signal) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill(signal);
  await Promise.race([exited, delay(2_000)]);
}
