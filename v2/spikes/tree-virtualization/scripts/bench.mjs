import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME_BINARY = process.env.CHROME_BINARY ?? "google-chrome-stable";
const KEY_COUNT = 100;
const KEY_INTERVAL_MS = 24;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchChrome(profileDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      CHROME_BINARY,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDir}`,
        "--window-size=1280,900",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let buffered = "";
    const onData = (chunk) => {
      buffered += String(chunk);
      const match = buffered.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        child.stderr.off("data", onData);
        resolve({ child, wsUrl: match[1] });
      }
    };
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`chrome exited early (${code})`)));
    setTimeout(() => reject(new Error("chrome did not expose DevTools")), 15_000);
  });
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    const eventListeners = [];
    let nextId = 1;
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId;
          nextId += 1;
          const message = { id, method, params };
          if (sessionId) {
            message.sessionId = sessionId;
          }
          socket.send(JSON.stringify(message));
          return new Promise((resolveCall, rejectCall) => {
            pending.set(id, { resolveCall, rejectCall });
          });
        },
        on(method, handler) {
          eventListeners.push({ method, handler });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("error", () => reject(new Error("cdp socket error")));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const call = pending.get(message.id);
        pending.delete(message.id);
        if (!call) {
          return;
        }
        if (message.error) {
          call.rejectCall(new Error(`${message.error.message}`));
        } else {
          call.resolveCall(message.result);
        }
        return;
      }
      for (const listener of eventListeners) {
        if (listener.method === message.method) {
          listener.handler(message.params, message.sessionId);
        }
      }
    });
  });
}

async function evaluate(cdp, sessionId, expression, timeoutMs = 180_000) {
  const result = await Promise.race([
    cdp.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    ),
    sleep(timeoutMs).then(() => {
      throw new Error(`evaluate timed out: ${expression.slice(0, 60)}`);
    }),
  ]);
  if (result.exceptionDetails) {
    throw new Error(
      `page exception: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ""}`,
    );
  }
  return result.result.value;
}

async function waitForHarness(cdp, sessionId) {
  for (let attempt = 0; attempt < 75; attempt += 1) {
    const ready = await evaluate(
      cdp,
      sessionId,
      "typeof window.__SKRIUW_TREE_BENCHMARK__ !== 'undefined'",
      10_000,
    );
    if (ready) {
      return;
    }
    await sleep(200);
  }
  throw new Error("harness did not expose the automation boundary");
}

async function dispatchTrustedArrowDown(cdp, sessionId) {
  const base = {
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
    nativeVirtualKeyCode: 40,
  };
  await cdp.send("Input.dispatchKeyEvent", { ...base, type: "rawKeyDown" }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" }, sessionId);
}

function summarizeTraceDurations(durationsMs) {
  const sorted = [...durationsMs].sort((left, right) => left - right);
  const at = (fraction) =>
    sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
  return {
    count: sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}

async function runFixture(baseUrl, fixture, resultsDir) {
  const profileDir = await mkdtemp(join(tmpdir(), "skriuw-tree-bench-"));
  const { child, wsUrl } = await launchChrome(profileDir);
  const consoleErrors = [];
  const pageErrors = [];
  try {
    const cdp = await connectCdp(wsUrl);
    const version = await cdp.send("Browser.getVersion");
    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    cdp.on("Runtime.consoleAPICalled", (params, eventSession) => {
      if (eventSession === sessionId && params.type === "error") {
        consoleErrors.push(params.args.map((argument) => argument.description ?? argument.value).join(" "));
      }
    });
    cdp.on("Runtime.exceptionThrown", (params, eventSession) => {
      if (eventSession === sessionId) {
        pageErrors.push(params.exceptionDetails.text);
      }
    });
    await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
    await waitForHarness(cdp, sessionId);
    await cdp.send("Target.activateTarget", { targetId: target.targetId });
    await cdp.send("Page.bringToFront", {}, sessionId);

    const benchmark = await evaluate(
      cdp,
      sessionId,
      `window.__SKRIUW_TREE_BENCHMARK__.run(${JSON.stringify(fixture)})`,
    );
    const galleryChecks = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_TREE_BENCHMARK__.galleryChecks()",
    );

    const visibleRows = await evaluate(
      cdp,
      sessionId,
      `window.__SKRIUW_TREE_BENCHMARK__.prepareTrusted(${JSON.stringify(fixture)})`,
    );
    const traceEvents = [];
    let traceComplete = null;
    let traceSupported = true;
    try {
      cdp.on("Tracing.dataCollected", (params) => {
        traceEvents.push(...params.value);
      });
      traceComplete = new Promise((resolve) => {
        cdp.on("Tracing.tracingComplete", () => resolve());
      });
      await cdp.send("Tracing.start", {
        traceConfig: { includedCategories: ["devtools.timeline", "input"] },
        transferMode: "ReportEvents",
      });
    } catch {
      traceSupported = false;
    }
    await sleep(200);
    for (let press = 0; press < KEY_COUNT; press += 1) {
      await dispatchTrustedArrowDown(cdp, sessionId);
      await sleep(KEY_INTERVAL_MS);
    }
    await sleep(300);
    let traceKeydown = null;
    if (traceSupported) {
      try {
        await cdp.send("Tracing.end");
        await Promise.race([traceComplete, sleep(20_000)]);
        const keydownDurations = traceEvents
          .filter(
            (event) =>
              event.name === "EventDispatch" &&
              event.args?.data?.type === "keydown" &&
              typeof event.dur === "number",
          )
          .map((event) => event.dur / 1_000);
        traceKeydown = summarizeTraceDurations(keydownDurations);
      } catch {
        traceKeydown = null;
      }
    }
    const trusted = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_TREE_BENCHMARK__.finishTrusted()",
    );

    const record = {
      fixture,
      baseUrl,
      browser: version.product,
      userAgent: version.userAgent,
      visibleRowsDuringTrustedPhase: visibleRows,
      benchmark,
      galleryChecks,
      trusted,
      traceKeydown,
      consoleErrors,
      pageErrors,
      finishedAt: new Date().toISOString(),
    };
    await writeFile(join(resultsDir, `${fixture}.json`), JSON.stringify(record, null, 2));
    cdp.close();
    return record;
  } finally {
    const exited = new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 5_000);
    });
    child.kill("SIGKILL");
    await exited;
    try {
      await rm(profileDir, { recursive: true, force: true });
    } catch {
      console.error(`profile directory left behind: ${profileDir}`);
    }
  }
}

async function main() {
  const [baseUrl, ...fixtures] = process.argv.slice(2);
  if (!baseUrl || fixtures.length === 0) {
    console.error("usage: node scripts/bench.mjs <base-url> <fixture> [fixture...]");
    process.exit(1);
  }
  const resultsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "results");
  await mkdir(resultsDir, { recursive: true });
  for (const fixture of fixtures) {
    const record = await runFixture(baseUrl, fixture, resultsDir);
    const failing = record.benchmark.correctness.filter((entry) => !entry.pass);
    const keyboard = record.benchmark.scenarios.find(
      (scenario) => scenario.name === "keyboard-selection-100",
    );
    console.log(
      [
        record.fixture,
        `rows=${record.benchmark.renderedRowCount}/${record.benchmark.visibleRowCount}`,
        `dom=${record.benchmark.totalDomElements}`,
        `kbd settled p95=${keyboard ? keyboard.settled.p95Ms.toFixed(2) : "n/a"}`,
        `trusted keydowns=${record.trusted.keydownCount}`,
        `checks failing=${failing.length}`,
        `console errors=${record.consoleErrors.length}`,
        `page errors=${record.pageErrors.length}`,
      ].join(" "),
    );
    if (failing.length > 0) {
      for (const entry of failing) {
        console.error(`  FAIL ${entry.name}: ${entry.detail}`);
      }
    }
  }
}

await main();
